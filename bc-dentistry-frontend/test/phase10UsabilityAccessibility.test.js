import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('web shell provides responsive layout, semantic navigation, and visible focus', () => {
  const app = read('src/App.jsx');
  const nav = read('src/assets/Sections/Navbar.jsx');
  const css = read('src/index.css');
  assert.match(app, /<main id="main-content" tabIndex="-1"/);
  assert.match(app, /lg:ml-\[15\.5%\]/);
  assert.match(nav, /<nav[^>]+aria-label="Primary navigation"/);
  assert.match(nav, /overflow-x-auto/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('notification control exposes its accessible name and state', () => {
  const notifications = read('src/assets/components/Notifications.jsx');
  assert.match(notifications, /aria-label=\{`\$\{unread\} unread notifications/);
  assert.match(notifications, /disabled=\{!unread\}/);
  assert.match(notifications, /aria-live="polite"/);
});

test('DICOM viewer exposes loading, success, error, and expanded states', () => {
  const viewer = read('src/assets/components/Patient/DicomViewer.jsx');
  for (const state of ['loading', 'success', 'error']) assert.match(viewer, new RegExp(`status: "${state}"`));
  assert.match(viewer, /aria-controls="dicom-viewport"/);
  assert.match(viewer, /aria-label="DICOM radiographic image viewport"/);
  assert.doesNotMatch(viewer, /X-Ray Sample/);
});

test('mobile account and personal information use authenticated data without fixtures', () => {
  const settings = fs.readFileSync(new URL('../../BC-Dentistry-Mobile-App/app/(tabs)/settings.jsx', import.meta.url), 'utf8');
  const personal = fs.readFileSync(new URL('../../BC-Dentistry-Mobile-App/components/PersonalInfo.jsx', import.meta.url), 'utf8');
  assert.match(settings, /useUser\(\)/);
  assert.match(settings, /session has expired/);
  assert.doesNotMatch(settings, /const sample/);
  assert.match(personal, /Patient information is unavailable/);
  assert.doesNotMatch(personal, /John|Peanuts|Aspirin/);
});

test('patient list and request controls remove placeholders and expose unique names', () => {
  const page = read('src/assets/Pages/Patients.jsx').replace(/^\s*\/\/.*$/gm, '');
  const request = read('src/assets/components/Patients/RequestPatientCard.jsx').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(page, /PatientsFilters/);
  assert.match(request, /aria-label="Request access/);
  assert.doesNotMatch(request, /console\.log/);
});

test('patient detail displays all SRS profile categories', () => {
  const detail = read('src/assets/components/Patient/PatientPersonalInfo.jsx');
  for (const label of ['Patient ID', 'Insurance Provider', 'Policy Number', 'Coverage Type', 'Emirates ID', 'Nationality', 'Address', 'Blood Type', 'Phone Number', 'Email', 'Clinic', 'Assigned Doctors']) assert.match(detail, new RegExp(label));
});
