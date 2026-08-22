import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

export const BUCKET = process.env.S3_BUCKET;

// Post/avatar photos are served straight back to the browser with no auth,
// so the bucket needs anonymous read. Safe to re-run — both calls are idempotent.
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }

  // PutBucketPolicy is how MinIO makes a bucket public — Cloudflare R2 (and
  // some other S3-compatible providers) doesn't implement this call at all;
  // R2 buckets are made public via a dashboard toggle (Public Development
  // URL) or a custom domain instead. Don't let that take the app down on
  // boot — warn and move on, since the bucket itself still works fine for
  // reads/writes either way.
  try {
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: "*",
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${BUCKET}/*`],
            },
          ],
        }),
      })
    );
  } catch (err) {
    console.warn(
      `Skipping automatic public-read bucket policy (${err.name || err.message}). ` +
      "Expected on providers like Cloudflare R2 — enable public access for the " +
      "bucket in its dashboard instead, and set S3_PUBLIC_URL to match."
    );
  }
}

export { PutObjectCommand };
