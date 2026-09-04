import { createCanvas, ImageData as NapiImageData } from "@napi-rs/canvas"
import type { JSDOM } from "jsdom"

let canvasPatched = false;

export function patchCanvasSupport() {
    if (canvasPatched) return;
    const window = globalThis.window as unknown as JSDOM['window'] | undefined;
    if (!window) throw new Error("Window is not found. Please create a virtual dom first.");

    const HTMLCanvasElement = window.HTMLCanvasElement;

    if (!HTMLCanvasElement) return;

    Object.defineProperty(HTMLCanvasElement.prototype, "_napiCanvasState", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: null
    })

    HTMLCanvasElement.prototype.getContext = function(type: string, options: CanvasRenderingContext2DSettings): any {
        if (type !== "2d") return null;

        const width = Number.isFinite(this.width) && this.width > 0 ? this.width : 300;
        const height = Number.isFinite(this.height) && this.height > 0 ? this.height : 150;

        // @ts-expect-error We have assigned this value previously
        const state = this._napiCanvasState || {};

        if (!state.canvas) {
            state.canvas = createCanvas(width, height);
        } else if (state.canvas.width !== width || state.canvas.height !== height) {
            state.canvas.width = width;
            state.canvas.height = height;
        }

        state.context = state.canvas.getContext("2d", options);
        // @ts-expect-error We have assigned this value previously
        this._napiCanvasState = state;
        return state.context;
    }

    HTMLCanvasElement.prototype.toDataURL = function(...args: [type?: string, quality?: number]): string {
        // @ts-expect-error We have assigned this value previously
        if (!this._napiCanvasState?.canvas) {
            const width = Number.isFinite(this.width) && this.width > 0 ? this.width : 300;
            const height = Number.isFinite(this.height) && this.height > 0 ? this.height : 150;
            // @ts-expect-error We have assigned this value previously
            this._napiCanvasState = {
                canvas: createCanvas(width, height),
                context: null,
            };
        }

        // @ts-expect-error We have assigned this value previously
        return this._napiCanvasState.canvas.toDataURL(...args);
    }

    if(!window.ImageData) window.ImageData = NapiImageData;

    if(!Reflect.has(globalThis, "ImageData")) {
        Object.defineProperty(globalThis, "ImageData", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: NapiImageData
        })
    }

    canvasPatched = true;
}