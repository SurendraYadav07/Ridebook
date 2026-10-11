import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development";
const buildScript = fileURLToPath(new URL("./build.mjs", import.meta.url));
const build = spawnSync(process.execPath, [buildScript], { stdio: "inherit", env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);

await import("./dist/index.mjs");
