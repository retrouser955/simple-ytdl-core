import type Innertube from "youtubei.js";
import { Platform, Types, type YT, YTNodes, Constants } from "youtubei.js";
import { SabrStream } from "googlevideo/sabr-stream"
import { SabrFormat } from "googlevideo/shared-types";
import { BotGuardSimplified } from "../BotGuard";
import { buildSabrFormat, EnabledTrackTypes } from "googlevideo/utils"
import { ytdlDebugger } from "../Debugger";
import { Readable, ReadableOptions } from "node:stream";

interface SabrNodeStreamOptions extends ReadableOptions {
    webStream: ReadableStream<Uint8Array>;
    stopSabr: () => void;
}

// #region SabrStream to NodeJS stream converter
class ServerAbrStream extends Readable {
    stopSabr: () => void;
    private reader: ReadableStreamDefaultReader<Uint8Array>;
    private isPulling = false;
    private isDestroyedOrClosed = false;

    constructor(options: SabrNodeStreamOptions) {
        super({
            highWaterMark: 64 * 1024,
            ...options,
            objectMode: false
        });
        this.stopSabr = options.stopSabr;
        this.reader = options.webStream.getReader();
    }

    override _read(_size: number): void {
        if (this.isPulling || this.isDestroyedOrClosed) return;
        this.pullChunks();
    }

    private async pullChunks() {
        this.isPulling = true;

        try {
            const { done, value } = await this.reader.read();

            if (done) {
                this.push(null);
                return;
            }

            const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
            const canStillPush = this.push(buffer);

            this.isPulling = false;

            if (canStillPush) {
                this.pullChunks();
            }
        } catch (error) {
            this.isPulling = false;
            this.destroy(error instanceof Error ? error : new Error(String(error)));
        }
    }

    override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        if (this.isDestroyedOrClosed) {
            callback(error);
            return;
        }

        this.isDestroyedOrClosed = true;

        this.reader.cancel(error ?? 'Stream destroyed').catch(() => { });
        this.reader.releaseLock();

        this.stopSabr();

        callback(error);
    }
}
// #endregion

const DEFAULT_OPTIONS = {
    audioQuality: "AUDIO_QUALITY_MEDIUM",
    enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
};

Platform.shim.eval = async (data: Types.BuildScriptResult, env: Record<string, Types.VMPrimative>) => {
    const properties = [];

    if (env.n) {
        properties.push(`n: exportedVars.nFunction("${env.n}")`);
    }

    if (env.sig) {
        properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
    }

    const code = `${data.output}\nreturn { ${properties.join(', ')} }`;

    return new Function(code)();
};

export async function createSabrStream(innertube: Innertube, videoId: string) {
    const botguard = await BotGuardSimplified.create(innertube);

    let accountInfo: null | YT.AccountInfo = null;

    try {
        accountInfo = await innertube.account.getInfo();
    } catch {
        // no-op
    }

    const dataSyncId = accountInfo
        ?.contents
        ?.contents[0]
        ?.endpoint
        ?.payload
        ?.supportedTokens?.[2]
        ?.datasyncIdToken
        ?.datasyncIdToken ??
        innertube.session.context.client.visitorData;

    const contentPoToken = await botguard.createBindingToken(videoId);
    const poToken = await botguard.createBindingToken(dataSyncId);

    const playerResponse = await innertube.getBasicInfo(videoId, {
        po_token: poToken
    })

    const serverAbrStreamingUrl = await innertube.session.player?.decipher(
        playerResponse.streaming_data?.server_abr_streaming_url,
    );

    const videoPlaybackUstreamerConfig = playerResponse
        .player_config?.media_common_config
        .media_ustreamer_request_config?.video_playback_ustreamer_config;

    if (!videoPlaybackUstreamerConfig) throw new Error("ustreamerConfig not found");
    if (!serverAbrStreamingUrl) throw new Error("serverAbrStreamingUrl not found");

    const sabrFormats: SabrFormat[] = playerResponse.streaming_data?.adaptive_formats.map(buildSabrFormat).filter(f => f.isOriginal ?? true) || [];

    const serverAbrStream = new SabrStream({
        formats: sabrFormats,
        serverAbrStreamingUrl,
        videoPlaybackUstreamerConfig,
        poToken: contentPoToken,
        clientInfo: {
            clientName: parseInt(Constants.CLIENT_NAME_IDS[innertube.session.context.client.clientName as keyof typeof Constants.CLIENT_NAME_IDS]),
            clientVersion: innertube.session.context.client.clientVersion,
        },

    });

    let protectionFailureCount = 0;
    let lastStatus: any = null;

    serverAbrStream.on("streamProtectionStatusUpdate", async (statusUpdate: any) => {
        if (statusUpdate.status !== lastStatus) {
            ytdlDebugger.debug("Stream Protection Status Update: \n" + JSON.stringify(statusUpdate, null, 2));
            lastStatus = statusUpdate.status;
        }
        if (statusUpdate.status === 2) {
            protectionFailureCount = Math.min(protectionFailureCount + 1, 10);
            if (protectionFailureCount === 1 || protectionFailureCount % 5 === 0) ytdlDebugger.debug(`Rotating PO token... (attempt ${protectionFailureCount})`);

            try {
                const rotationMinter = await BotGuardSimplified.create(innertube, protectionFailureCount >= 3)
                const placeholderToken = rotationMinter.generatePlaceholder(videoId);
                serverAbrStream.setPoToken(placeholderToken);
                const mintedPoToken = await rotationMinter.createBindingToken(videoId);
                serverAbrStream.setPoToken(mintedPoToken);
            } catch (err) {
                if (protectionFailureCount === 1 || protectionFailureCount % 5 === 0)
                    ytdlDebugger.debug("Failed to rotate PO token:" + err);

            }
        } else if (statusUpdate.status === 3) {
            ytdlDebugger.debug("Stream protection rejected token (SPS 3). Resetting Botguard.");
            botguard.shutdown();
        } else {
            protectionFailureCount = 0;
        }
    });

    const { audioStream } = await serverAbrStream.start(DEFAULT_OPTIONS);

    const nodeSabrStream = new ServerAbrStream({
        stopSabr: () => {
            serverAbrStream.abort()
        },
        webStream: audioStream
    })

    return nodeSabrStream
}