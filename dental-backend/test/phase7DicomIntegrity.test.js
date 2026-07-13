const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha256File, verifyFileIntegrity } = require('../radiographicIntegrity');

test('upload hash generation and successful verification use SHA-256 file bytes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edr-phase7-'));
  const file = path.join(dir, 'scan.dcm');
  fs.writeFileSync(file, Buffer.from('DICOM test bytes'));
  const hash = await sha256File(file);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await verifyFileIntegrity(file, hash), { status: 'verified', actualSha256: hash });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('verification detects mismatch, missing file, and unknown metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edr-phase7-'));
  const file = path.join(dir, 'scan.dcm');
  fs.writeFileSync(file, 'changed bytes');
  assert.equal((await verifyFileIntegrity(file, '0'.repeat(64))).status, 'mismatch');
  fs.unlinkSync(file);
  assert.equal((await verifyFileIntegrity(file, '0'.repeat(64))).status, 'missing file');
  assert.equal((await verifyFileIntegrity(file, '')).status, 'unknown');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upload, on-chain metadata and access routes are source guarded', () => {
  const api = fs.readFileSync(path.resolve(__dirname, '..', 'index.js'), 'utf8');
  const chaincode = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fabric-samples', 'dental-record-sharing', 'chaincode-javascript', 'lib', 'dentalRecordSharing.js'), 'utf8');
  assert.match(api, /app\.post\('\/radiographic-files', authenticateToken, requireRoles\('doctor'\)/);
  assert.match(api, /submitTransaction\(\s*'AddDentalFileMetadata'/);
  assert.match(api, /storageReference: `filesystem:\$\{fileID\}`/);
  assert.match(chaincode, /_requirePatientRecordAccess\(ctx, patientID, patient, 'doctor'\)/);
  assert.match(chaincode, /sha256: sha256\.toLowerCase\(\)/);
  const metadataTransaction = chaincode.match(/async AddDentalFileMetadata[\s\S]*?async addDentalFile/)[0];
  assert.doesNotMatch(metadataTransaction, /fileContent|fileBytes|base64/);
});
