import rateLimit from "express-rate-limit";

/** Login / register: prevent credential-stuffing and signup spam. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many attempts. Please try again later.",
  },
});

/** OTP request: prevent SMS-bombing a phone number / running up SMS costs. */
export const otpRequestRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many OTP requests. Please try again later.",
  },
});

/** OTP verify: slow down brute-forcing a 6-digit code. */
export const otpVerifyRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many attempts. Please try again later.",
  },
});
