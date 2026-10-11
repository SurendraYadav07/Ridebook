import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { closeWebSocketServer, initWebSocketServer } from "./lib/ws-server";
import { startScheduledRidesWorker } from "./lib/workers/scheduled-worker";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"] || "4000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

async function start() {
  await pool.query("SELECT 1");
  initWebSocketServer(server);
  const scheduledWorker = startScheduledRidesWorker(60_000);
  server.listen(port, () => logger.info({ port }, "RideGo API and WebSocket server running"));

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down API server");
    clearInterval(scheduledWorker);
    void closeWebSocketServer();
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.fatal({ err: error }, "API server failed to start; check DATABASE_URL and database migrations");
  process.exit(1);
});
