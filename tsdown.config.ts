import { defineConfig } from "tsdown";

export default defineConfig({
    format: ["cjs", "esm"],
    entry: ["./src/index.ts", "./src/BotGuard/worker.ts"],
    outDir: "./dist",
    deps: {
        skipNodeModulesBundle: true
    },
    dts: true
})