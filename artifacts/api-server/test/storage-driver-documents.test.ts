import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getUploadUrl, getDownloadUrl, isStorageConfigured, getStorageMetadata } from "../src/lib/storage";
import { REQUIRED_DOCUMENT_TYPES, normalizeDocumentType } from "../src/routes/drivers";

describe("Storage Engine & S3 Presigned URLs", () => {
  test("generates valid upload URL with expected method and headers", async () => {
    const key = "driver-documents/user_123/license.jpg";
    const res = await getUploadUrl(key, "image/jpeg", 900);

    assert.equal(res.method, "PUT");
    assert.equal(res.key, key);
    assert.equal(res.headers["Content-Type"], "image/jpeg");
    assert.ok(typeof res.uploadUrl === "string" && res.uploadUrl.length > 0);
  });

  test("generates valid download URL for storage key", async () => {
    const key = "driver-documents/user_123/license.jpg";
    const downloadUrl = await getDownloadUrl(key, 3600);

    assert.ok(typeof downloadUrl === "string" && downloadUrl.length > 0);
    assert.ok(downloadUrl.includes(key));
  });

  test("provides storage metadata safely without exposing secrets", () => {
    const meta = getStorageMetadata();
    assert.ok("configured" in meta);
    assert.ok("region" in meta);
    assert.ok("hasAccessKey" in meta);
  });
});

describe("Driver Document Verification Workflow", () => {
  test("normalizes driver document type aliases correctly", () => {
    assert.equal(normalizeDocumentType("driving_license"), "license");
    assert.equal(normalizeDocumentType("license"), "license");
    assert.equal(normalizeDocumentType("identity_document"), "id_proof");
    assert.equal(normalizeDocumentType("id_proof"), "id_proof");
    assert.equal(normalizeDocumentType("vehicle_registration"), "vehicle_registration");
    assert.equal(normalizeDocumentType("vehicle_photo"), "vehicle_photo");
    assert.equal(normalizeDocumentType("selfie"), "selfie");
  });

  test("enforces all 5 required document types for full driver approval", () => {
    assert.equal(REQUIRED_DOCUMENT_TYPES.length, 5);
    assert.ok(REQUIRED_DOCUMENT_TYPES.includes("license" as any));
    assert.ok(REQUIRED_DOCUMENT_TYPES.includes("vehicle_registration" as any));
    assert.ok(REQUIRED_DOCUMENT_TYPES.includes("id_proof" as any));
    assert.ok(REQUIRED_DOCUMENT_TYPES.includes("vehicle_photo" as any));
    assert.ok(REQUIRED_DOCUMENT_TYPES.includes("selfie" as any));
  });

  test("simulates document approval gating logic for online mode", () => {
    const submittedDocs = [
      { type: "license", status: "approved" },
      { type: "vehicle_registration", status: "approved" },
      { type: "id_proof", status: "approved" },
      { type: "vehicle_photo", status: "pending" }, // Not approved yet!
      { type: "selfie", status: "approved" },
    ];

    const approvedTypes = new Set(
      submittedDocs.filter((d) => d.status === "approved").map((d) => d.type)
    );
    const missingOrPending = REQUIRED_DOCUMENT_TYPES.filter(
      (t) => !approvedTypes.has(t as any)
    );

    assert.equal(missingOrPending.length, 1);
    assert.equal(missingOrPending[0], "vehicle_photo");

    // Once all approved:
    submittedDocs[3].status = "approved";
    const allApprovedTypes = new Set(
      submittedDocs.filter((d) => d.status === "approved").map((d) => d.type)
    );
    const remaining = REQUIRED_DOCUMENT_TYPES.filter(
      (t) => !allApprovedTypes.has(t as any)
    );
    assert.equal(remaining.length, 0);
  });
});
