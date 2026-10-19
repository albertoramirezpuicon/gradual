import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

const s3 = new S3Client({
  region: env.AWS_REGION,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
});

/** Short-lived signed URLs (5 min). The bucket is private. */
const TTL = 300;

export function presignPut(key: string, mime: string, size: number) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mime, ContentLength: size }),
    { expiresIn: TTL },
  );
}

/**
 * Signed download URL. When `fileName` is given, the browser receives that name;
 * `inline` lets PDFs open in a browser tab instead of downloading (D38).
 */
export function presignGet(key: string, opts: { fileName?: string; inline?: boolean } = {}) {
  const disposition = opts.fileName
    ? `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`
    : undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: TTL },
  );
}

/** Downloads an object fully into memory (used for CV PDFs, max 5 MB). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const r = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  return r.Body!.transformToByteArray();
}

export async function headObject(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/** Object keys are always prefixed by tenant. */
export const keys = {
  logo: (tenantId: string, id: string, ext: string) => `t/${tenantId}/branding/logo-${id}.${ext}`,
  resource: (tenantId: string, id: string, ext: string) => `t/${tenantId}/resources/${id}.${ext}`,
  cv: (tenantId: string, userId: string, id: string) => `t/${tenantId}/cv/${userId}/${id}.pdf`,
};
