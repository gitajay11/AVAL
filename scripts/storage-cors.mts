// Sets the bucket's CORS rules so browsers can PUT uploads to presigned URLs and
// load signed media. Neon Object Storage manages CORS through the S3 API.
//
//   pnpm storage:cors:live                      # live bucket, origin = APP_URL in .env
//   pnpm storage:cors:live https://other.app    # extra origins (e.g. a preview domain)
//   pnpm storage:cors:live --show               # print the current rules
//   pnpm storage:cors:live --clear              # remove all rules
import { config } from "dotenv";
import { DeleteBucketCorsCommand, GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const bucket = process.env.STORAGE_BUCKET || "aval-media";
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("AWS_ENDPOINT_URL_S3 / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set (run `neon deploy`).");

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

if (args.includes("--clear")) {
  await s3.send(new DeleteBucketCorsCommand({ Bucket: bucket }));
  console.log(`CORS rules removed from ${bucket}: browsers can't upload until you run this again with an origin.`);
  process.exit(0);
}

if (args.includes("--show")) {
  const res = await s3.send(new GetBucketCorsCommand({ Bucket: bucket })).catch((e) => ({ error: String(e.name ?? e) }));
  console.log(JSON.stringify("CORSRules" in res ? res.CORSRules : res, null, 2));
  process.exit(0);
}

const origins = [process.env.APP_URL, ...args.filter((a) => a.startsWith("http"))]
  .filter((o): o is string => Boolean(o))
  .map((o) => new URL(o).origin);
if (origins.length === 0) throw new Error("No origin: set APP_URL in .env (or pass one).");

await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [...new Set(origins)],
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`CORS on ${bucket} (${new URL(endpoint).host}) now allows: ${[...new Set(origins)].join(", ")}`);
