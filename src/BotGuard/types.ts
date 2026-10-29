export enum BotguardOperations {
    BindingToken,
    PlaceholderToken,
    UnsafeBindingToken,
    ShutDown
}

export interface BaseWorkerMessage {
    ua: string | undefined;
    op: BotguardOperations;
    exec: string;
}

export interface GenerateToken extends BaseWorkerMessage {
    d: {
        binder: string
    },
    op: BotguardOperations.BindingToken | BotguardOperations.PlaceholderToken | BotguardOperations.UnsafeBindingToken
}

export interface Shutdown extends BaseWorkerMessage {
    d: {},
    op: BotguardOperations.ShutDown
}

export type WorkerResponse<T> = ({ d: T } | { e: Error | string }) & { exec: string }