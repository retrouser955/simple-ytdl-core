# YouTube Downloader

This module is used by `discord-player-youtubei` to stream youtube videos.

# Features
- Support SABR
- Automatically extract po tokens

# Usage

```bash
npm install simple-ytdl-core
```

```js
const { createWriteStream } = require("node:fs");
const { createSabrStream, ytdlDebugger } = require("simple-ytdl-core");
const { Innertube }= require("youtubei.js");

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