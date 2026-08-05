const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const api = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'bc-dentistry-frontend', 'src', 'assets', 'components', 'Patient', 'ClinicalRecords.jsx'), 'utf8');

test('API enforces explicit FDI tooth and dental-surface allowlists', () => {
  assert.match(api, /FDI_TOOTH_CODES/);
  assert.match(api, /DENTAL_SURFACES = new Set\(\['W','M','D','O','I','B','L','P','F'\]\)/);
  assert.match(api, /INVALID_DENTAL_TOOTH/);
  assert.match(api, /INVALID_DENTAL_SURFACE/);
  assert.match(api, /DENTAL_TOOTH_REQUIRED/);
  assert.match(api, /DENTAL_SURFACE_REQUIRED/);
  assert.match(api, /DENTAL_SURFACE_CONFLICT/);
  assert.match(api, /teeth:\[\.\.\.new Set\(teeth\)\]\.sort/);
  assert.match(api, /surfaces:\[\.\.\.new Set\(surfaces\)\]\.sort/);
});

test('legacy valid singular tooth input normalizes to whole-tooth coding', () => {
  assert.match(api, /legacyTooth \? \['W'\] : \[\]/);
  assert.match(api, /payload\.teeth \?\? payload\.tooth/);
});

test('doctor UI uses searchable multi-selects instead of free text coding', () => {
  assert.match(ui, /import Select from 'react-select'/);
  assert.match(ui, /isMulti isSearchable required/);
  assert.match(ui, /Teeth \(FDI notation\)/);
  assert.match(ui, /Whole tooth/);
  assert.match(ui, /Select at least one tooth and one surface/);
});
