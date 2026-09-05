import Innertube from "youtubei.js";
import { ytdlDebugger } from "./Debugger";
import { ClientList, createAdaptiveStreamMultiStep } from "./AdaptiveStream";
import { createSabrStream } from "./ServerAbr";

export * from "./ServerAbr";
export * from "./BotGuard";
export * from "./Debugger";
export * from "./AdaptiveStream";

export async function downloadMultiStep(innertube: Innertube, videoId: string, adaptiveClientList?: ClientList, prio: "adaptive" | "SABR" = "adaptive") {
    try {
        if (prio === "SABR") {
            ytdlDebugger.debug("Attempting to stream using the SABR protocol...");
            const stream = await createSabrStream(innertube, videoId);

            return stream;
        } else {
            ytdlDebugger.debug("Attempting to use adaptive formats to download video.");
            const stream = await createAdaptiveStreamMultiStep(innertube, videoId, adaptiveClientList);
            return stream;
        }
    } catch {
        ytdlDebugger.debug(`Stream extraction of ${prio} failed.`);
        if (prio === "SABR") {
            ytdlDebugger.debug("Attempting to stream using the SABR protocol...");
            const stream = await createAdaptiveStreamMultiStep(innertube, videoId, adaptiveClientList);
            return stream;
        } else {
            ytdlDebugger.debug("Attempting to use adaptive formats to download video.");
            const stream = await createSabrStream(innertube, videoId);

            return stream;
        }
    }
}