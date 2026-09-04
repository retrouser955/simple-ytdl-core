import { BotGuardClient } from "bgutils-js/botguard";
import { USER_AGENT, parseLooseJSON, buildURL, getHeaders } from "bgutils-js/utils";
import { WebPoMinter, createColdStartToken } from "bgutils-js/webpo";
import { WebPoSignalOutput } from "bgutils-js/shared-types";
import { JSDOM } from "jsdom";
import type { Innertube, IRawResponse } from "youtubei.js"
import { ytdlDebugger } from "../Debugger";
import { patchCanvasSupport } from "./patchCanvas";

let bgSimplified: BotGuardSimplified | undefined = undefined;
const requestKey = 'O43z0dpjhgX20SCx4KAo';

export class BotGuardSimplified {
    _activeScriptId: string | undefined;

    constructor(
        public _botguard: BotGuardClient,
        public _innertube: Innertube,
        public minter: WebPoMinter,
        private window: JSDOM['window']
    ) { }

    static async create(innertube: Innertube, force = false) {
        if (bgSimplified && !force) return bgSimplified;
        if (bgSimplified) bgSimplified.shutdown();

        const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
            url: 'https://www.youtube.com',
            referrer: 'https://www.youtube.com/',
            // @ts-ignore
            userAgent: USER_AGENT,
        });

        const pageResponse = await fetch('https://www.youtube.com', {
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.7",
                "user-agent": innertube.session.user_agent ?? USER_AGENT,
            }
        });

        const pageHtml = await pageResponse.text();

        const ytConfig = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
        if (!ytConfig) {
            throw new Error('Could not find ytcfg in page HTML');
        }

        dom.window.yt = { config_: JSON.parse(ytConfig) /* Needed because of EVENT_ID */ };

        Object.assign(globalThis, {
            yt: dom.window.yt,
            window: dom.window,
            document: dom.window.document,
            location: dom.window.location,
            origin: dom.window.origin
        });

        if (!('navigator' in globalThis)) {
            Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
        }

        patchCanvasSupport()

        ytdlDebugger.debug("Loading challenge data")
        const initialAttestationData = pageHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/);

        if (!initialAttestationData || !initialAttestationData[1]) throw new Error("Failed to find the challenge in page HTML");

        const initialAttestationDataJson = parseLooseJSON(initialAttestationData[1]);
        const challengeResponse = initialAttestationDataJson.R as IRawResponse;

        if (!challengeResponse.bgChallenge) throw new Error("Could not find BotGuard challenge")

        const interpreterUrl = challengeResponse.bgChallenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
        const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
        const interpreterJavascript = await bgScriptResponse.text();

        ytdlDebugger.debug("Challenge data loaded. Executing challenges");

        if (interpreterJavascript) {
            new Function(interpreterJavascript)();
        } else throw new Error('Loading VM failed.');

        const botGuardClient = await BotGuardClient.create({
            program: challengeResponse.bgChallenge.program,
            globalName: challengeResponse.bgChallenge.globalName,
            globalObject: globalThis
        });

        const webPoSignalOutput: WebPoSignalOutput = [];
        const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

        const payload = [requestKey, botguardResponse];

        const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const integrityTokenJson = await integrityTokenResponse.json() as [string, number, number, string];

        const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = integrityTokenJson;

        const integrityTokenData = {
            integrityToken,
            estimatedTtlSecs,
            mintRefreshThreshold,
            websafeFallbackToken
        };

        const webPoMinter = await WebPoMinter.create(integrityTokenData, webPoSignalOutput);

        const botguardSimplified = new BotGuardSimplified(botGuardClient, innertube, webPoMinter, globalThis['window'] as unknown as JSDOM['window']);
        bgSimplified = botguardSimplified;

        return botguardSimplified
    }

    createBindingToken(videoId: string) {
        return this.minter.mintAsWebsafeString(videoId);
    }

    generatePlaceholder(bindingId: string) {
        return createColdStartToken(bindingId)
    }

    shutdown() {
        try {
            this._botguard.shutdown();
        } finally {
            // no-op
        }

        if (this._activeScriptId) {
            this.window.document.getElementById(this._activeScriptId)?.remove();
        }

        this._activeScriptId = undefined;
        bgSimplified = undefined;
    }
}