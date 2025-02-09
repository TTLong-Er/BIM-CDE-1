console.log("hello world!");

import * as fs from "fs";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "";
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY || "";
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "";
const blobName = "example.txt";
const filePath = "./example.txt";

async function main() {
  if (!accountName || !accountKey || !containerName)
    throw new Error("Missing Azure Storage account");
  try {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    const fileBuffer = fs.readFileSync(filePath);
  } catch (error: any) {
    throw new Error(error.message);
  }
}
main();
