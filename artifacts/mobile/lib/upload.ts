import * as ImagePicker from "expo-image-picker";
import { customFetch } from "@workspace/api-client-react";

export interface PresignedUploadResponse {
  uploadUrl: string;
  method: "PUT";
  storageKey: string;
  headers?: Record<string, string>;
  isLocalFallback?: boolean;
  expiresInSeconds?: number;
}

export interface UploadFileResult {
  storageKey: string;
  localUri: string;
  filename: string;
  contentType: string;
}

/**
 * Requests a presigned upload URL from the RideGo API server.
 */
export async function requestPresignedUpload(params: {
  filename: string;
  contentType: string;
  fileSize?: number;
  folder?: string;
}): Promise<PresignedUploadResponse> {
  const res = await customFetch<PresignedUploadResponse>("/uploads/presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  return res;
}

/**
 * Uploads a local file blob / URI to the presigned upload URL via HTTP PUT.
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const blob = await fetch(localUri).then((r) => r.blob());

  const request = {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...(extraHeaders || {}),
    },
    body: blob,
  } as const;
  if (uploadUrl.startsWith("/uploads/local/")) {
    await customFetch<{ status: string }>(uploadUrl, { ...request, responseType: "json" });
    return;
  }

  const response = await fetch(uploadUrl, request);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Upload failed (${response.status}): ${errorText || response.statusText}`);
  }
}

/**
 * Convenience helper: opens image gallery picker, gets presigned URL, and uploads image.
 */
export async function pickAndUploadDocument(options?: {
  folder?: string;
  allowsEditing?: boolean;
}): Promise<UploadFileResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera roll permission is required to upload documents.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: options?.allowsEditing ?? true,
    quality: 0.85,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const filename = asset.fileName || `doc_${Date.now()}.jpg`;
  const contentType = asset.mimeType || "image/jpeg";
  const fileSize = asset.fileSize;

  const presigned = await requestPresignedUpload({
    filename,
    contentType,
    fileSize,
    folder: options?.folder || "driver-documents",
  });

  await uploadToPresignedUrl(
    presigned.uploadUrl,
    asset.uri,
    contentType,
    presigned.headers
  );

  return {
    storageKey: presigned.storageKey,
    localUri: asset.uri,
    filename,
    contentType,
  };
}

/**
 * Convenience helper: opens camera, takes photo/selfie, gets presigned URL, and uploads.
 */
export async function takePhotoAndUpload(options?: {
  folder?: string;
  cameraType?: ImagePicker.CameraType;
}): Promise<UploadFileResult | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera permission is required to take a photo.");
  }

  const result = await ImagePicker.launchCameraAsync({
    cameraType: options?.cameraType ?? ImagePicker.CameraType.back,
    allowsEditing: true,
    quality: 0.85,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const filename = `photo_${Date.now()}.jpg`;
  const contentType = asset.mimeType || "image/jpeg";
  const fileSize = asset.fileSize;

  const presigned = await requestPresignedUpload({
    filename,
    contentType,
    fileSize,
    folder: options?.folder || "driver-documents",
  });

  await uploadToPresignedUrl(
    presigned.uploadUrl,
    asset.uri,
    contentType,
    presigned.headers
  );

  return {
    storageKey: presigned.storageKey,
    localUri: asset.uri,
    filename,
    contentType,
  };
}
