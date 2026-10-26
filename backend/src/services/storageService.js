const fs = require('fs');
const path = require('path');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, isMockMode, S3_BUCKET_NAME } = require('../config/aws');

const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../storage/s3_local');

/**
 * Ensures the local mock directory exists.
 */
function ensureLocalDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Uploads an encrypted file buffer to S3 (or local mock disk).
 *
 * @param {string} s3Key - Path/Key in S3 bucket
 * @param {Buffer} buffer - Encrypted file bytes
 * @param {string} [contentType='application/octet-stream']
 */
async function uploadToS3(s3Key, buffer, contentType = 'application/octet-stream') {
  if (!isMockMode && s3Client) {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    });
    await s3Client.send(command);
    return { bucket: S3_BUCKET_NAME, key: s3Key };
  }

  // Local fallback
  const localFilePath = path.join(LOCAL_STORAGE_DIR, s3Key);
  ensureLocalDir(path.dirname(localFilePath));
  fs.writeFileSync(localFilePath, buffer);

  return { bucket: 'local-mock-bucket', key: s3Key };
}

/**
 * Downloads an encrypted file buffer from S3 (or local mock disk).
 *
 * @param {string} s3Key
 * @returns {Promise<Buffer>}
 */
async function downloadFromS3(s3Key) {
  if (!isMockMode && s3Client) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  // Local fallback
  const localFilePath = path.join(LOCAL_STORAGE_DIR, s3Key);
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`File '${s3Key}' not found in local mock storage.`);
  }
  return fs.readFileSync(localFilePath);
}

/**
 * Deletes an encrypted file from S3 (or local mock disk).
 */
async function deleteFromS3(s3Key) {
  if (!isMockMode && s3Client) {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(command);
    return;
  }

  const localFilePath = path.join(LOCAL_STORAGE_DIR, s3Key);
  if (fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
  }
}

module.exports = {
  uploadToS3,
  downloadFromS3,
  deleteFromS3,
  S3_BUCKET_NAME,
};
