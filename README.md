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
