# YouTube Downloader

This module is used by `discord-player-youtubei` to stream youtube videos.

# Features
- Support SABR
- Automatically extract po tokens

# Usage

```bash
npm install simple-ytdl-core
```

## Sabr Streams

```js
const { createWriteStream } = require("node:fs");
const { createSabrStream, ytdlDebugger } = require("simple-ytdl-core");
const { Innertube } = require("youtubei.js");

;(async () => {
    ytdlDebugger.onDebug(console.log);

    const tube = await Innertube.create();
    // serverabr stream. audio only
    // maybe video in the future but that is current out of the scope of this project
    const stream = await createSabrStream(tube, "mE2O5LsrPuA");

    stream.pipe(createWriteStream("./neverbealone.m4a"))
})().catch(err => {
    throw err
});
```

# Adaptive Streams

Alternatively, you can download using the adaptive stream module.

```js
const { createWriteStream } = require("node:fs");
const { createAdaptiveStream, ytdlDebugger } = require("simple-ytdl-core");
const { Innertube } = require("youtubei.js");

;(async () => {
    ytdlDebugger.onDebug(console.log);

    const tube = await Innertube.create();
    const stream = await createAdaptiveStream(tube, "mE2O5LsrPuA");

    stream.pipe(createWriteStream("./neverbealone.m4a"))
})().catch(err => {
    throw err
});
```

Sometimes, YouTube fails for some clients while some other clients work. You can achieve the highest reliability rate by using `createAdaptiveStreamMultiStep`. This will cycle through 3 clients (VISIONOS, MWEB, WEB_EMBEDDED) and download from the one that works. This may increase requests to YouTube.

```js
const { createWriteStream } = require("node:fs");
const { createAdaptiveStream, ytdlDebugger } = require("simple-ytdl-core");
const { Innertube } = require("youtubei.js");

;(async () => {
    ytdlDebugger.onDebug(console.log);

    const tube = await Innertube.create();
    // cycle through 3 clients. see which one works.
    // You may also supply your own custom cycling array using the third parameter.
    // Use this type: { client: Types.InnerTubeClient, requirePoToken: boolean, requireDecipher: boolean }[]
    const stream = await createAdaptiveStreamMultiStep(tube, "mE2O5LsrPuA");

    stream.pipe(createWriteStream("./neverbealone.m4a"));
})().catch(err => {
    throw err
});
```

## SABR + Adaptive

If you want to try all of the streams. You can use the following example. However, this will increase the amount of requests being sent to YouTube.

```js
const { createWriteStream } = require("node:fs");
const { downloadMultiStep, ytdlDebugger } = require("simple-ytdl-core");
const { Innertube } = require("youtubei.js");

;(async () => {
    ytdlDebugger.onDebug(console.log);

    const tube = await Innertube.create();
    // cycle through 3 clients. see which one works.
    // You may also supply your own custom cycling array for adaptive format using the third parameter.
    // Use the same type as `createAdaptiveStreamMultiStep`
    // You can also target which stream to try first using the 4th parameter.
    // You can use this type: "SABR" | "adaptive"
    const stream = await downloadMultiStep(tube, "mE2O5LsrPuA");

    stream.pipe(createWriteStream("./neverbealone.m4a"));
})().catch(err => {
    throw err
});
```

So far, our examples only download audio since this package's focus is for discord-player-youtubei. In the next section, we will learn how to merge streams to get qualities up to 4K.

# Merged Streams

On higher qualities such as 1080p or 1440p, YouTube deliver seperated streams. Good news, this package automatically package merge these into a single audio file :\).

## Requirements

[`mediabunny`](https://mediabunny.dev/) is required for muxing streams. Let us install mediabunny.

```bash
npm install mediabunny
# Not required but recommended. This will ensure weird formats will be merged correctly
npm install @mediabunny/server
```

`@mediabunny/server` is a library that polyfills WebAPIs in a NodeJS server using [`node-av`](https://github.com/seydx/node-av) (a FFmpeg wrapper). This is good to have for weird formats to ensure stability. The below example has been tested without the use of `@mediabunny/server` and confirmed to be working. Without `@mediabunny/server`, the library will not use FFmpeg to transcode.

```ts
const { createWriteStream } = require("node:fs");
const { ytdlDebugger, createSabrStream } = require("simple-ytdl-core");
const { Innertube } = require("youtubei.js");
const { EnabledTrackTypes } = require('googlevideo/utils')

;(async () => {
    ytdlDebugger.onDebug(console.log);

    const tube = await Innertube.create();
    const stream = await createSabrStream(tube, "y1uzBncUsQQ", {
        enabledTrackTypes: EnabledTrackTypes.VIDEO_AND_AUDIO,
        preferMP4: true,
        videoQuality: "720p" // go up to 4K for supported videos!
    });

    stream.pipe(createWriteStream("./Origami.mp4"))
})().catch(err => {
    throw err
});
```