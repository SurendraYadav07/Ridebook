import { build as esbuild } from "esbuild";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join(__dirname, f));

const outdir = join(__dirname, "dist");

await esbuild({
  entryPoints: testFiles,
  bundle: true,
  platform: "node",
  format: "esm",
  outdir,
  outExtension: { ".js": ".mjs" },
  external: ["node:test", "node:assert", "node:assert/strict", "pg-native"],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
  },
  sourcemap: "inline",
});

const builtFiles = readdirSync(outdir)
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => join(outdir, f));

const result = spawnSync("node", ["--test", ...builtFiles], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/ridebooker_test",
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "test_jwt_access_secret_key_32bytes_long",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "test_jwt_refresh_secret_key_32bytes_long",
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret",
  },
});

process.exit(result.status ?? 0);
