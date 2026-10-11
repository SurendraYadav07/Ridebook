import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import type { ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = process.env.NODE_ENV === "production"
  ? configuredOrigins
  : [...new Set([...configuredOrigins, "http://localhost:8081", "http://127.0.0.1:8081", "http://localhost:19006"])];
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Native clients and server-to-server requests do not send an Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
};
app.use(cors(corsOptions));
app.use(express.json({
  verify(req, _res, buffer) {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const status = error?.message === "Origin is not allowed by CORS" ? 403 : 500;
  req.log?.error({ err: error }, "Request failed");
  res.status(status).json({ error: status === 403 ? "Origin is not allowed" : "Internal server error" });
};
app.use(errorHandler);

export default app;
