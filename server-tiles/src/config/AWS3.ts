import AWS from "aws-sdk";
import streamifier from "streamifier";
import _ from "lodash";

const configAWS = {
  s3ForcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_KEY_ID || "",
  },
  region: process.env.AWS_REGION || "",
  endpoint: process.env.AWS_HOST || "",
  apiVersions: {
    s3: "2006-03-01",
  },

  logger: process.stdout,
};
//@ts-ignore
AWS.config.update(configAWS);

export const awsClient = new AWS.S3();
export async function uploadSmall(
  awsClient: AWS.S3,
  data: any,
  bucketName: string,
  fullPath: string,
  mimetype: string
) {
  await awsClient
    .upload({
      Bucket: bucketName,
      ACL: "public-read-write",
      Key: fullPath,
      Body: data,
      ContentType: mimetype,
      StorageClass: "STANDARD",
    })
    .promise();
}
const defaultBufferSize = 5 * 1024 * 1024; // 50MB
const maxBufferSize = 50 * 1024 * 1024; // 50MB

export async function uploadLarge(
  awsClient: AWS.S3,
  buffer: Uint8Array,
  bucketName: string,
  originalname: string,
  mimetype: string
) {
  let chunkCount = 1;
  const CHUNK_SIZE =
    buffer.byteLength > maxBufferSize ? maxBufferSize : defaultBufferSize;
  const multipartCreateResult = await awsClient
    .createMultipartUpload({
      Bucket: bucketName,
      Key: originalname,
      ACL: "public-read-write",
      ContentType: mimetype,
      StorageClass: "STANDARD",
    })
    .promise();
  const uploadedParts: {ETag: string; PartNumber: number}[] = [];
  async function gatherChunks() {
    const bufferStream = streamifier.createReadStream(buffer, {
      highWaterMark: CHUNK_SIZE,
    });
    for await (const data of bufferStream) {
      // do something with data
      const etag = await awsClient
        .uploadPart({
          Body: data,
          Bucket: bucketName,
          Key: originalname,
          PartNumber: chunkCount,
          UploadId: multipartCreateResult.UploadId!,
        })
        .promise()
        .then((result) => {
          return result.ETag!.toString();
        });
      uploadedParts.push({
        ETag: etag,
        PartNumber: chunkCount,
      });
      chunkCount++;
    }
  }
  await gatherChunks();

  const sortedUploads = _.sortBy(uploadedParts, "PartNumber");
  //@ts-ignore
  await awsClient
    .completeMultipartUpload({
      Bucket: bucketName,
      Key: originalname,
      MultipartUpload: {
        Parts: sortedUploads,
      },
      UploadId: multipartCreateResult.UploadId!,
    })
    .promise();
}
