import { YTNodes, Innertube } from "youtubei.js";
import type { ReloadPlaybackContext } from 'googlevideo/protos';

export async function makePlayerRequest(innertube: Innertube, input: string | YTNodes.NavigationEndpoint, reloadPlaybackContext?: ReloadPlaybackContext) {
    const watchEndpoint = typeof input === 'string' ? new YTNodes.NavigationEndpoint({ watchEndpoint: { videoId: input } }) : input;

    const extraArgs: Record<string, any> = {
        playbackContext: {
            contentPlaybackContext: {
                vis: 0,
                splay: false,
                signatureTimestamp: innertube.session.player?.signature_timestamp
            }
        },
        contentCheckOk: true,
        racyCheckOk: true,
        client: 'WEB'
    };

    if (reloadPlaybackContext) {
        extraArgs.playbackContext.reloadPlaybackContext = reloadPlaybackContext;
    }

    return await watchEndpoint.call(innertube.actions, { ...extraArgs, parse: true });
}