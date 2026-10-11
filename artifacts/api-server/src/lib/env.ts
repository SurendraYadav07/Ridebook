/**
 * Environment configuration and validation.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is required but was not provided. See .env.example.`,
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "production",

  // Auth tokens
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,

  // SMS & OTP
  smsProvider: process.env.SMS_PROVIDER ?? null,
  otpTtlSeconds: 5 * 60,
  otpMaxAttempts: 5,
  otpRequestCooldownSeconds: 30,
} as const;

if (env.nodeEnv === "production") {
  if (Buffer.byteLength(env.jwtAccessSecret, "utf8") < 32 || Buffer.byteLength(env.jwtRefreshSecret, "utf8") < 32) {
    throw new Error("Production JWT secrets must each contain at least 32 bytes. See .env.example.");
  }
  if (env.jwtAccessSecret === env.jwtRefreshSecret) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
  }
}

export const isDevOtpAllowed = (env.nodeEnv === "development" || env.nodeEnv === "test") && !env.smsProvider;
