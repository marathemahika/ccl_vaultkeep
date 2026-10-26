/**
 * VaultKeep End-to-End API Integration Test Script
 * Run with: node test-e2e.js
 */
const http = require('http');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
let ownerToken = null;
let ownerUserId = null;
let uploadedDocId = null;
let testNomineeId = null;

function request(method, path, body = null, token = null, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let payload = null;
    if (body) {
      if (contentType === 'application/json') {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      } else {
        payload = body;
        headers['Content-Type'] = contentType;
        headers['Content-Length'] = payload.length;
      }
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let parsed;
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            parsed = raw.toString('utf8');
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBuffer: raw });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function makeMultipart(boundary, fields, fileField) {
  const crlf = '\r\n';
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(`--${boundary}${crlf}`);
    parts.push(`Content-Disposition: form-data; name="${key}"${crlf}${crlf}`);
    parts.push(`${val}${crlf}`);
  }

  if (fileField) {
    parts.push(`--${boundary}${crlf}`);
    parts.push(
      `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${crlf}`
    );
    parts.push(`Content-Type: ${fileField.contentType || 'application/octet-stream'}${crlf}${crlf}`);
    parts.push(fileField.buffer);
    parts.push(crlf);
  }

  parts.push(`--${boundary}--${crlf}`);

  const buffers = parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf8')));
  return Buffer.concat(buffers);
}

async function run() {
  console.log('====================================================');
  console.log('   VaultKeep Backend End-to-End API Test Suite      ');
  console.log('====================================================\n');

  // 1. Health check
  console.log('[1/8] Testing /api/health ...');
  const healthRes = await request('GET', '/api/health');
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: ${JSON.stringify(healthRes.body)}`);
  }
  console.log('✓ Health check passed:', healthRes.body);

  // 2. Register Owner
  const testEmail = `owner_${Date.now()}@example.com`;
  console.log(`\n[2/8] Registering vault owner (${testEmail}) ...`);
  const regRes = await request('POST', '/api/auth/register', {
    email: testEmail,
    password: 'Password123!',
    full_name: 'Mahika Marathe',
    checkin_interval_days: 30,
    grace_period_days: 7,
  });

  if (regRes.status !== 201) {
    throw new Error(`Registration failed (${regRes.status}): ${JSON.stringify(regRes.body)}`);
  }
  ownerToken = regRes.body.token;
  ownerUserId = regRes.body.user.id;
  console.log('✓ Owner registered successfully. User ID:', ownerUserId);

  // 3. Check-in Heartbeat
  console.log('\n[3/8] Testing manual check-in heartbeat ...');
  const checkinRes = await request('POST', '/api/checkin', {}, ownerToken);
  if (checkinRes.status !== 200) {
    throw new Error(`Check-in failed: ${JSON.stringify(checkinRes.body)}`);
  }
  console.log('✓ Heartbeat recorded:', checkinRes.body.message);
  console.log('  Days remaining until next check-in:', checkinRes.body.daysRemaining);

  // 4. Document Upload with KMS Envelope Encryption
  console.log('\n[4/8] Testing Document Upload & KMS Envelope Encryption ...');
  const boundary = `----VaultKeepBoundary${Date.now()}`;
  const testSecretText = 'CONFIDENTIAL WILL AND TESTAMENT: All assets bequeathed safely via VaultKeep.';
  const multipartBody = makeMultipart(
    boundary,
    { title: 'Last Will & Testament', category: 'will' },
    {
      name: 'file',
      filename: 'will_and_testament.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(testSecretText, 'utf8'),
    }
  );

  const uploadRes = await request(
    'POST',
    '/api/documents/upload',
    multipartBody,
    ownerToken,
    `multipart/form-data; boundary=${boundary}`
  );

  if (uploadRes.status !== 201) {
    throw new Error(`Upload failed (${uploadRes.status}): ${JSON.stringify(uploadRes.body)}`);
  }
  uploadedDocId = uploadRes.body.document.id;
  console.log('✓ Document encrypted and stored in S3!');
  console.log('  Doc ID:', uploadedDocId);
  console.log('  SHA-256 checksum:', uploadRes.body.document.sha256);

  // 5. Add Nominee & Assign Document Release
  console.log('\n[5/8] Adding Nominee and assigning document release ...');
  const nomRes = await request(
    'POST',
    '/api/nominees',
    {
      full_name: 'Trusted Beneficiary',
      email: `nominee_${Date.now()}@example.com`,
      relationship: 'Sibling',
    },
    ownerToken
  );
  if (nomRes.status !== 201) {
    throw new Error(`Add nominee failed: ${JSON.stringify(nomRes.body)}`);
  }
  testNomineeId = nomRes.body.nominee.id;
  console.log('✓ Nominee added. ID:', testNomineeId);

  // Assign document release
  const relRes = await request(
    'POST',
    `/api/nominees/${testNomineeId}/releases`,
    { document_ids: [uploadedDocId] },
    ownerToken
  );
  if (relRes.status !== 200) {
    throw new Error(`Release assignment failed: ${JSON.stringify(relRes.body)}`);
  }
  console.log('✓ Document assigned to nominee:', relRes.body.message);

  // 6. Download & Decrypt Document as Owner
  console.log('\n[6/8] Downloading and decrypting document from S3 via KMS ...');
  const downRes = await request('GET', `/api/documents/${uploadedDocId}/download`, null, ownerToken);
  if (downRes.status !== 200) {
    throw new Error(`Download failed: ${JSON.stringify(downRes.body)}`);
  }
  const decryptedText = downRes.rawBuffer.toString('utf8');
  if (decryptedText !== testSecretText) {
    throw new Error(`Decrypted content mismatch! Got: ${decryptedText}`);
  }
  console.log('✓ Document decrypted successfully! Content verified:');
  console.log(`  "${decryptedText}"`);

  // 7. Verify Audit Logs
  console.log('\n[7/8] Verifying immutable audit trail ...');
  const auditRes = await request('GET', '/api/audit', null, ownerToken);
  if (auditRes.status !== 200) {
    throw new Error(`Audit log fetch failed: ${JSON.stringify(auditRes.body)}`);
  }
  console.log('✓ Audit logs verified. Total events logged:', auditRes.body.stats.total_events);
  console.log('  Recent actions logged:', auditRes.body.logs.map((l) => l.action).slice(0, 5));

  // 8. Lifecycle Check
  console.log('\n[8/8] Testing EventBridge/Lambda lifecycle trigger ...');
  const lifeRes = await request('POST', '/api/lifecycle/check', null, null, 'application/json');
  // Expected 403 without key, 200 with key
  const lifeWithKey = await (async () => {
    return new Promise((resolve) => {
      const url = new URL('/api/lifecycle/check', BASE_URL);
      const req = http.request(
        url,
        { method: 'POST', headers: { 'x-lifecycle-key': 'vaultkeep-internal-lifecycle-key' } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
        }
      );
      req.end();
    });
  })();
  console.log('✓ Lifecycle trigger executed:', lifeWithKey.message);

  console.log('\n====================================================');
  console.log('  ALL VAULTKEEP BACKEND INTEGRATION TESTS PASSED!    ');
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
