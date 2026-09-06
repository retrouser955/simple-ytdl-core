import type Innertube from "youtubei.js";
import type { Types } from "youtubei.js";
import { ytdlDebugger } from "../Debugger";
import { Readable } from "node:stream";
import { Constants, Utils } from "youtubei.js";
import { BotGuardSimplified } from "../BotGuard";

const TEN_MB = 10 * 1024 * 1024;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

export type ClientList = { client: Types.InnerTubeClient, requirePoToken: boolean, requireDecipher: boolean }[];

const RELIABLE_CLIENTS: ClientList = [
    {
        client: "VISIONOS",
        requirePoToken: false,
        requireDecipher: false
    },
    {
        client: "MWEB",
        requirePoToken: true,
        requireDecipher: true
    },
    {
        client: "WEB_EMBEDDED",
        requirePoToken: true,
        requireDecipher: true
    }
] as const;

export async function createAdaptiveStreamMultiStep(innertube: Innertube, videoId: string, clientList?: ClientList) {
    ytdlDebugger.debug("Downloading by trying to clients...");

    let firstRun = true;
    let poToken: string | undefined = undefined;

    for (const client of clientList ?? RELIABLE_CLIENTS) {
        if (!firstRun) {
            await wait(500);
            firstRun = false;
        }

        ytdlDebugger.debug(`Attempting to download video using ${client.client}...`);
        try {
            if (client.requirePoToken && !poToken) {
                const accountInfo = await innertube.account.getInfo().catch(_ => null);
                const dataSyncId = accountInfo?.contents?.contents[0]?.endpoint?.payload?.supportedTokens?.[2]?.datasyncIdToken?.datasyncIdToken ?? innertube.session.context.client.visitorData;
                const botguard = await BotGuardSimplified.create(innertube);

                poToken = await botguard.createBindingToken(dataSyncId);
            }
            const stream = await createAdaptiveStream(innertube, videoId, client.client, client.requirePoToken ? poToken : undefined, client.requireDecipher);
            return stream;
        } catch {
            ytdlDebugger.debug(`Downloading of video failed with ${client.client}.`);
            continue;
        }
    }

    throw new Error("Stream extraction failed")
}

export async function createAdaptiveStream(innertube: Innertube, videoId: string, client?: Types.InnerTubeClient, poToken?: string, decipher = false) {
    const info = await innertube.getBasicInfo(videoId, {
        client: client ?? "VISIONOS",
        po_token: poToken as string
    });

    const format = info.chooseFormat({
        type: "audio",
        quality: "best",
        format: "any"
    });

    const url = decipher ? await format.decipher(innertube.session.player) : format.url;

    if (!format || !url || !format.content_length) {
        throw new Error("Unable to find matching formats.");
    }

    const contentLength = Number(format.content_length);
    ytdlDebugger.debug(`Found format for ${videoId} (${contentLength} total bytes)`);

    const mainAbortController = new AbortController();

    const initialEnd = Math.min(TEN_MB - 1, contentLength - 1);
    const initialUrl = `${url}&cpn=${info.cpn}&range=0-${initialEnd}`;

    ytdlDebugger.debug(`Probing stream with initial range: 0-${initialEnd}`);

    const initialResponse = await innertube.session.http.fetch_function(initialUrl, {
        headers: Constants.STREAM_HEADERS,
        signal: mainAbortController.signal
    });

    if (!initialResponse.ok || !initialResponse.body) {
        throw new Error(`Probe failed. Status: ${initialResponse.status}`);
    }

    ytdlDebugger.debug("Probe successful. Initial 10MB response received. Initializing stream...");

    let initialBody: ReadableStream | null = initialResponse.body;
    let nextByteStart = initialEnd + 1;
    let chunkAbortController: AbortController | null = null;
    let isFetching = false;

    const readable = new Readable({
        highWaterMark: 4 * 1024 * 1024,

        async read() {
            if (isFetching) return;

            if (nextByteStart >= contentLength && !initialBody) {
                ytdlDebugger.debug("All bytes consumed. Ending stream with push(null).");
                this.push(null);
                return;
            }

            isFetching = true;

            try {
                if (initialBody) {
                    const bodyStream = initialBody;
                    initialBody = null;

                    ytdlDebugger.debug("Pushing initial 10MB probe chunks into stream...");
                    for await (const rawChunk of Utils.streamToIterable(bodyStream)) {
                        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
                        this.push(chunk);
                    }
                    ytdlDebugger.debug(`Finished pushing initial probe. Next byte target: ${nextByteStart} / ${contentLength}`);
                } else if (nextByteStart < contentLength) {
                    const chunkEnd = Math.min(nextByteStart + TEN_MB - 1, contentLength - 1);
                    const chunkUrl = `${url}&cpn=${info.cpn}&range=${nextByteStart}-${chunkEnd}`;

                    ytdlDebugger.debug(`Fetching chunk range: ${nextByteStart}-${chunkEnd} (Progress: ${Math.round((nextByteStart / contentLength) * 100)}%)`);

                    chunkAbortController = new AbortController();

                    const chunkResponse = await innertube.session.http.fetch_function(chunkUrl, {
                        headers: Constants.STREAM_HEADERS,
                        signal: chunkAbortController.signal
                    });

                    if (!chunkResponse.ok || !chunkResponse.body) {
                        throw new Error(`Chunk fetch failed at byte ${nextByteStart}. Status: ${chunkResponse.status}`);
                    }

                    for await (const rawChunk of Utils.streamToIterable(chunkResponse.body)) {
                        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
                        this.push(chunk);
                    }

                    nextByteStart = chunkEnd + 1;
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    ytdlDebugger.debug(`Stream error: ${err.message}`);
                    this.destroy(err);
                }
            } finally {
                isFetching = false;
                if (nextByteStart < contentLength && this.readableLength < this.readableHighWaterMark) {
                    setImmediate(() => this._read(0));
                } else if (nextByteStart >= contentLength) {
                    this.push(null);
                }
            }
        },

        destroy(err, callback) {
            mainAbortController.abort();
            if (chunkAbortController) {
                try {
                    chunkAbortController.abort();
                } catch {
                    // no-op. cancel error
                }
            }
            callback(err);
        }
    });

    return readable;
}