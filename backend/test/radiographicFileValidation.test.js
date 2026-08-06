const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateRadiographicFile } = require('../radiographicFileValidation');

test('application API rejects executable bytes even when their headers are spoofed', () => {
  const result = validateRadiographicFile({
    bytes: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256)]),
    fileName: 'malware.dcm',
    mediaType: 'application/dicom',
  });
  assert.equal(result.valid, false);
});

test('application API validates before authorization query or private-service relay', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const route = source.match(/app\.post\('\/radiographic-files'[\s\S]*?app\.get\('\/radiographic-files\/:fileID\/content'/)[0];
  assert.ok(route.indexOf('validateRadiographicFile') < route.indexOf('authorizedPatients'));
  assert.ok(route.indexOf('validateRadiographicFile') < route.indexOf("callBlockchainResponse(req, '/radiographic-files'"));
  assert.match(route, /415, 'UNSUPPORTED_RADIOGRAPHIC_FILE_TYPE'/);
});
