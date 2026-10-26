const crypto = require('crypto');
const { GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { kmsClient, isMockMode, KMS_KEY_ID } = require('../config/aws');

// Mock key for offline simulation when AWS KMS is not yet provisioned
const MOCK_MASTER_KEY = crypto.createHash('sha256').update('vaultkeep-local-mock-master-key-seed').digest();

/**
 * Zeros out a sensitive buffer in memory to reduce window of exposure in RAM.
 */
function zeroBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
}

/**
 * Requests a new 256-bit envelope data encryption key.
 * In AWS production: Calls KMS GenerateDataKey.
 * Returns: { plaintextKey: Buffer, encryptedDataKey: Buffer, kmsKeyId: string }
 */
async function generateEnvelopeKey() {
  if (!isMockMode && kmsClient) {
    const command = new GenerateDataKeyCommand({
      KeyId: KMS_KEY_ID,
      KeySpec: 'AES_256',
    });
    const response = await kmsClient.send(command);
    return {
      plaintextKey: Buffer.from(response.Plaintext),
      encryptedDataKey: Buffer.from(response.CiphertextBlob),
      kmsKeyId: response.KeyId || KMS_KEY_ID,
    };
  }

  // Local mock fallback
  const plaintextKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MOCK_MASTER_KEY, iv);
  const encryptedKey = Buffer.concat([iv, cipher.update(plaintextKey), cipher.final(), cipher.getAuthTag()]);

  return {
    plaintextKey,
    encryptedDataKey: encryptedKey,
    kmsKeyId: 'mock-kms-cmk-id',
  };
}

/**
 * Decrypts an encrypted data key back into plaintext using AWS KMS.
 * In AWS production: Calls KMS Decrypt.
 */
async function decryptEnvelopeKey(encryptedDataKey, kmsKeyId) {
  if (!isMockMode && kmsClient) {
    const command = new DecryptCommand({
      CiphertextBlob: encryptedDataKey,
      KeyId: kmsKeyId || KMS_KEY_ID,
    });
    const response = await kmsClient.send(command);
    return Buffer.from(response.Plaintext);
  }

  // Local mock fallback: extract IV (12 bytes), Tag (16 bytes), and ciphertext
  const iv = encryptedDataKey.subarray(0, 12);
  const tag = encryptedDataKey.subarray(encryptedDataKey.length - 16);
  const ciphertext = encryptedDataKey.subarray(12, encryptedDataKey.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', MOCK_MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypts a plaintext document buffer using AES-256-GCM with the provided data key.
 *
 * @param {Buffer} buffer - Plaintext document file buffer
 * @param {Buffer} plaintextKey - 32-byte AES key
 * @returns {{ ciphertext: Buffer, iv: Buffer, authTag: Buffer, sha256Hex: string }}
 */
function encryptDocument(buffer, plaintextKey) {
  // Compute SHA-256 hash of original plaintext for integrity verification
  const sha256Hex = crypto.createHash('sha256').update(buffer).digest('hex');

  // 12-byte initialization vector (recommended standard for AES-GCM)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', plaintextKey, iv);

  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  return {
    ciphertext,
    iv,
    authTag,
    sha256Hex,
  };
}

/**
 * Decrypts ciphertext buffer using AES-256-GCM and verifies SHA-256 integrity.
 *
 * @param {Buffer} ciphertext
 * @param {Buffer} plaintextKey
 * @param {Buffer} iv
 * @param {Buffer} authTag
 * @param {string} [expectedSha256]
 * @returns {Buffer} Decrypted plaintext buffer
 */
function decryptDocument(ciphertext, plaintextKey, iv, authTag, expectedSha256 = null) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', plaintextKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Verify plaintext integrity
  if (expectedSha256) {
    const computedSha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
    if (computedSha256 !== expectedSha256) {
      throw new Error('Integrity verification failed! Plaintext checksum mismatch.');
    }
  }

  return plaintext;
}

module.exports = {
  zeroBuffer,
  generateEnvelopeKey,
  decryptEnvelopeKey,
  encryptDocument,
  decryptDocument,
};
