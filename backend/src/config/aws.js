const { KMSClient } = require('@aws-sdk/client-kms');
const { S3Client } = require('@aws-sdk/client-s3');

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'vaultkeep-documents-default';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';

// Mock mode is enabled if explicitly requested OR if KMS_KEY_ID is missing
const isMockMode = process.env.MOCK_AWS === 'true' || !KMS_KEY_ID;

let kmsClient = null;
let s3Client = null;

if (!isMockMode) {
  const clientConfig = { region: AWS_REGION };

  // If explicit credentials are provided in .env (for local dev with real AWS),
  // configure them. In EC2 production, IAM instance profile is used automatically.
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  kmsClient = new KMSClient(clientConfig);
  s3Client = new S3Client(clientConfig);
  console.log(`[AWS Config] Connected to real AWS KMS & S3 in region '${AWS_REGION}'.`);
} else {
  console.log('[AWS Config] Running in Mock/Local mode (no AWS credentials or KMS_KEY_ID found). Safe for offline development.');
}

module.exports = {
  kmsClient,
  s3Client,
  isMockMode,
  AWS_REGION,
  S3_BUCKET_NAME,
  KMS_KEY_ID: KMS_KEY_ID || 'alias/vaultkeep-mock-cmk',
};
