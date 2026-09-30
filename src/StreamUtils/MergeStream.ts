import { ytdlDebugger } from "../Debugger";

export async function importMediaBunnyOrThrow() {
    let mediabunny: typeof import("mediabunny") | undefined = undefined;

    try {
        mediabunny = await import("mediabunny");
        try {
            const mediabunnyServer = await import("@mediabunny/server");
            mediabunnyServer.registerMediabunnyServer();
        } catch {
            ytdlDebugger.debug("Unable to find @mediabunny/server. This may cause some issues when merging streams.")
        }
    } catch {
        throw new Error("Unable to find mediabunny. Install it via npm install mediabunny");
    }

    return mediabunny!;
}

export async function mergeStreams(video: ReadableStream, audio: ReadableStream, abort?: () => unknown) {
    const {
        Input,
        ALL_FORMATS,
        Mp4OutputFormat,
        ReadableStreamSource,
        Output,
        StreamTarget,
        Conversion
    } = await importMediaBunnyOrThrow();

    const videoSource = new ReadableStreamSource(video);
    const audioSource = new ReadableStreamSource(audio);

    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const outputStream = new ReadableStream<Uint8Array>({
        start(controller) {
            streamController = controller
        },
        cancel: () => {
            abort?.()
        }
    })

    const writable = new WritableStream({
        write(chunks) {
            streamController?.enqueue(chunks.data)
        }
    })

    const videoInput = new Input({
        formats: ALL_FORMATS,
        source: videoSource
    });

    const audioInput = new Input({
        formats: ALL_FORMATS,
        source: audioSource
    });

    const output = new Output({
        format: new Mp4OutputFormat({
            fastStart: "fragmented"
        }),
        target: new StreamTarget(writable)
    })

    const videoConversion = await Conversion.init({
        input: videoInput,
        output,
        audio: {
            discard: true,
        },
        composable: true
    })

    const audioConversion = await Conversion.init({
        input: audioInput,
        output,
        video: {
            discard: true
        },
        composable: true
    })

    await output.start();

    Promise.all([
        videoConversion.execute(),
        audioConversion.execute()
    ]).then(async () => {
        await output.finalize();
        streamController?.close();
    }).catch(error => {
        streamController?.error(error)
    })

    return outputStream
}