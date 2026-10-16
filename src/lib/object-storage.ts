import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

// Neon Object Storage (S3-compatible, branches with the database). `neon deploy`
// injects the AWS-standard variables for the linked branch; locally they point
// at an S3 emulator. Neon requires path-style addressing and SigV4.

let client: S3Client | undefined;

function s3(): S3Client {
  if (client) return client;
  const e = env();
  if (!e.AWS_ENDPOINT_URL_S3 || !e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY) {
    throw new ApiError(503, "storage_unavailable", "Media storage isn't configured.");
  }
  client = new S3Client({
    region: e.AWS_REGION ?? "us-east-1",
    endpoint: e.AWS_ENDPOINT_URL_S3,
    forcePathStyle: true,
    credentials: { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY },
    // Don't add CRC32 checksum headers the browser upload wouldn't send.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

const bucket = () => env().STORAGE_BUCKET;

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * Presigned PUT that only accepts exactly this type and byte length: both headers
 * are part of the signature, so the browser can't upload anything else.
 */
export async function presignUpload(key: string, contentType: string, contentLength: number) {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
  return { url, headers: { "Content-Type": contentType } };
}

/**
 * Short-lived signed GET. Media is never public. `contentType`/`downloadName`
 * override what storage sends, so arbitrary uploaded files are served as downloads.
 */
export function presignDownload(
  key: string,
  opts: { expiresIn?: number; downloadName?: string; contentType?: string } = {},
) {
  const { expiresIn = 60 * 60, downloadName, contentType } = opts;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(contentType ? { ResponseContentType: contentType } : {}),
      ...(downloadName
        ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` }
        : {}),
    }),
    { expiresIn },
  );
}

/** Server-side upload (e.g. link-preview images fetched by the server). */
export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    return null;
  }
}

/** First `n` bytes of an object, for file-signature sniffing. */
export async function readHead(key: string, n = 32): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${n - 1}` }));
  return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch((err) => {
    console.error("[storage] delete failed", key, err);
  });
}
