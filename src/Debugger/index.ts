class YTDLDebugger {
    private debugFunc?: (text: string) => unknown;

    debug(text: string) {
        this.debugFunc?.(`[YouTubeDL]: ${text}`);
    }

    onDebug(func: (text: string) => unknown) {
        this.debugFunc = func;
    }
}

export const ytdlDebugger = new YTDLDebugger();