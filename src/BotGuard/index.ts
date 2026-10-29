import type { Innertube } from "youtubei.js"
import crypto from "node:crypto";
import path from "node:path";
import { BotguardOperations, GenerateToken, Shutdown, WorkerResponse } from "./types";
import { Worker } from "node:worker_threads";

const isCJS = typeof require !== "undefined";

let bgSimplified: BotGuardSimplified | undefined = undefined;

export class BotGuardSimplified {
    _activeScriptId: string | undefined;

    constructor(
        public _innertube: Innertube,
        public worker: Worker
    ) { }

    static async create(innertube: Innertube, force = false) {
        if (bgSimplified && !force) return bgSimplified;
        if (bgSimplified) bgSimplified.shutdown();

        const workerPath = isCJS ? path.join(__dirname, "BotGuard", "worker.cjs") : path.join(__dirname, "BotGuard", "worker.mjs");

        const worker = new Worker(workerPath);

        worker.unref();

        const botguardSimplified = new BotGuardSimplified(innertube, worker);

        return botguardSimplified
    }

    private generateExecId() {
        return `${Date.now()}${crypto.randomBytes(16).toString("hex")}`;
    }

    private createWorkerPromise<T>(execId: string) {
        return new Promise<T>((res, rej) => {
            const workerListener = (ev: WorkerResponse<T>) => {
                if (ev.exec === execId) {
                    if ((ev as any).d) {
                        cleanup();
                        res((ev as any).d as T);
                    } else {
                        cleanup();
                        rej((ev as any).e as Error | string)
                    }
                }
            }

            const cleanup = () => {
                this.worker.removeListener("message", workerListener);
            }

            this.worker.addListener("message", workerListener);
        })
    }

    async createBindingToken(videoId: string) {
        const execId = this.generateExecId();
        const message: GenerateToken = {
            d: {
                binder: videoId
            },
            exec: execId,
            op: BotguardOperations.BindingToken,
            ua: this._innertube.session.user_agent,
        }
        this.worker.postMessage(message)
        const response = await this.createWorkerPromise<string>(execId);

        return response;
    }

    async generatePlaceholder(bindingId: string) {
        const execId = this.generateExecId();
        const message: GenerateToken = {
            d: {
                binder: bindingId
            },
            exec: execId,
            op: BotguardOperations.PlaceholderToken,
            ua: this._innertube.session.user_agent,
        }
        this.worker.postMessage(message)
        const response = await this.createWorkerPromise<string>(execId);

        return response;
    }

    async createUnsafeBindingToken(videoId: string) {
        const execId = this.generateExecId();
        const message: GenerateToken = {
            d: {
                binder: videoId
            },
            exec: execId,
            op: BotguardOperations.UnsafeBindingToken,
            ua: this._innertube.session.user_agent,
        }
        this.worker.postMessage(message)
        const response = await this.createWorkerPromise<Uint8Array<ArrayBufferLike>>(execId);

        return response;
    }

    async shutdown() {
        const execId = this.generateExecId();
        const message: Shutdown = {
            exec: execId,
            d: {},
            op: BotguardOperations.ShutDown,
            ua: this._innertube.session.user_agent,
        }
        this.worker.postMessage(message)
        await this.createWorkerPromise<void>(execId);
    }
}