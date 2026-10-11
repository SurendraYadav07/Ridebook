import crypto from "crypto";

const isProduction = (process.env.NODE_ENV ?? "production") === "production";

export interface PresignedUploadResult {
  uploadUrl: string;
  method: "PUT";
  key: string;
  headers: Record<string, string>;
  isLocalFallback: boolean;
  expiresInSeconds: number;
}

export interface StorageConfig {
  bucket: string | null;
  region: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  endpoint: string | null;
  forcePathStyle: boolean;
  publicCdnUrl: string | null;
}

const config: StorageConfig = {
  bucket: process.env.S3_BUCKET || null,
  region: process.env.S3_REGION || "ap-south-1",
  accessKeyId: process.env.S3_ACCESS_KEY_ID || null,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || null,
  endpoint: process.env.S3_ENDPOINT || null,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  publicCdnUrl: process.env.S3_PUBLIC_CDN_URL || null,
};

/**
 * Checks whether full S3 credentials and bucket name are configured in environment.
 */
export function isStorageConfigured(): boolean {
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
}

/**
 * Returns the current storage configuration metadata (sensitive keys masked).
 */
export function getStorageMetadata() {
  return {
    configured: isStorageConfigured(),
    bucket: config.bucket,
    region: config.region,
    hasAccessKey: Boolean(config.accessKeyId),
    endpoint: config.endpoint,
    publicCdnUrl: config.publicCdnUrl,
  };
}

// ---------------------------------------------------------------------------
// AWS SigV4 Presigned URL Generator (Zero Heavy Dependencies)
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacSha256Hex(key: Buffer | string, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = hmacSha256("AWS4" + key, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, "aws4_request");
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|.d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

/**
 * Builds an AWS SigV4 Presigned URL for PUT or GET operations.
 */
function buildSigV4PresignedUrl(
  method: "PUT" | "GET",
  key: string,
  contentType?: string,
  expiresInSeconds: number = 900
): string {
  if (!isStorageConfigured()) {
    throw new Error("Cannot build S3 presigned URL without valid S3 credentials.");
  }

  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const cleanKey = key.replace(/^\/+/, "");

  let host: string;
  let canonicalUri: string;

  if (config.endpoint) {
    const parsedEndpoint = new URL(config.endpoint);
    host = parsedEndpoint.host;
    canonicalUri = config.forcePathStyle ? `/${config.bucket}/${cleanKey}` : `/${cleanKey}`;
  } else {
    host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
    canonicalUri = `/${cleanKey}`;
  }

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": method === "PUT" && contentType ? "content-type;host" : "host",
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  let canonicalHeaders = `host:${host}\n`;
  if (method === "PUT" && contentType) {
    canonicalHeaders = `content-type:${contentType.toLowerCase()}\nhost:${host}\n`;
  }

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    queryParams["X-Amz-SignedHeaders"],
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    config.secretAccessKey!,
    dateStamp,
    config.region,
    "s3"
  );
  const signature = hmacSha256Hex(signingKey, stringToSign);

  const protocol = config.endpoint?.startsWith("http://") ? "http" : "https";
  return `${protocol}://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ---------------------------------------------------------------------------
// Public Storage API
// ---------------------------------------------------------------------------

/**
 * Returns a presigned PUT upload URL or local development upload URL.
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900
): Promise<PresignedUploadResult> {
  const cleanKey = key.replace(/^\/+/, "");

  if (isStorageConfigured()) {
    const uploadUrl = buildSigV4PresignedUrl("PUT", cleanKey, contentType, expiresInSeconds);
    return {
      uploadUrl,
      method: "PUT",
      key: cleanKey,
      headers: {
        "Content-Type": contentType,
      },
      isLocalFallback: false,
      expiresInSeconds,
    };
  }

  if (isProduction) {
    throw new Error("Object storage is unavailable because S3 credentials are not configured.");
  }

  // Local development fallback
  return {
    uploadUrl: `/uploads/local/${cleanKey}`,
    method: "PUT",
    key: cleanKey,
    headers: {
      "Content-Type": contentType,
    },
    isLocalFallback: true,
    expiresInSeconds,
  };
}

/**
 * Returns a presigned GET download URL or CDN / local fallback URL.
 */
export async function getDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const cleanKey = key.replace(/^\/+/, "");

  if (config.publicCdnUrl) {
    return `${config.publicCdnUrl.replace(/\/+$/, "")}/${cleanKey}`;
  }

  if (isStorageConfigured()) {
    return buildSigV4PresignedUrl("GET", cleanKey, undefined, expiresInSeconds);
  }

  if (isProduction) {
    throw new Error("Object storage is unavailable because S3 credentials are not configured.");
  }

  // Local development fallback
  return `/uploads/local/${cleanKey}`;
}
