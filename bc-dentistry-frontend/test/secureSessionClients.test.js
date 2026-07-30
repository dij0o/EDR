import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('web uses cookies, CSRF, refresh, me, and server logout without bearer storage', () => {
  const api = read('src/assets/config/api.js');
  const login = read('src/assets/Sections/LoginSection.jsx');
  const logout = read('src/assets/Sections/Topbar.jsx');
  const auth = read('src/assets/utils/auth.js');
  assert.match(api, /X-CSRF-Token/);
  assert.match(api, /\/auth\/refresh/);
  assert.match(api, /\/auth\/me/);
  assert.match(login, /clientType: 'web'/);
  assert.match(login, /withCredentials: true/);
  assert.match(logout, /\/auth\/logout/);
  assert.doesNotMatch(`${api}\n${login}\n${auth}`, /localStorage\.(getItem|setItem)\(['"]token/);
});

test('web session channel initializes before use and production HTML is self-hosted', () => {
  const auth = read('src/assets/utils/auth.js');
  const html = read('index.html');
  const declaration = auth.indexOf('const sessionChannel');
  const listener = auth.indexOf("sessionChannel?.addEventListener");
  assert.ok(declaration >= 0 && listener > declaration, 'sessionChannel must be initialized before listener registration');
  assert.doesNotMatch(html, /https?:\/\/(cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)/);
});

test('mobile uses SecureStore, serialized rotation, restoration, and real logout', () => {
  const context = read('../BC-Dentistry-Mobile-App/Context/UserContext.jsx');
  const settings = read('../BC-Dentistry-Mobile-App/app/(tabs)/settings.jsx');
  const api = read('../BC-Dentistry-Mobile-App/utils/api.js');
  assert.match(context, /expo-secure-store/);
  assert.match(context, /refreshPromise/);
  assert.match(context, /\/auth\/refresh/);
  assert.match(context, /\/auth\/logout/);
  assert.match(context, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(settings, /Log out/);
  assert.doesNotMatch(api, /openuae|fortiddns/);
  assert.match(api, /must use HTTPS outside local development/);
});
