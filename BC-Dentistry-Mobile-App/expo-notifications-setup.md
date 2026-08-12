# Expo Push Notifications Setup Guide (bc-dentistry)

**Project context:** Expo SDK 52, `expo-router`, React Native 0.76.9, EAS builds.

**Current goal (Phase 1):** Get a raw FCM device token logged to the console, then send a test push directly from the **Firebase Cloud Messaging console** to that token. No Expo Push Service, no EAS credentials, no backend yet — just prove the native FCM pipeline works end to end.

**Later (Phase 2):** Full integration — Expo push tokens, backend token storage, EAS FCM V1 credentials, production sending. Not part of this task yet.

---

## Phase 1: Get FCM token + test via Firebase Console

### 1. Install dependencies

```bash
npx expo install expo-notifications expo-device expo-constants
```

- `expo-notifications` — provides `getDevicePushTokenAsync()` to get the raw native token
- `expo-device` — confirms the app is running on a physical device
- `expo-constants` — not strictly required for this phase, but needed later for Expo push tokens

Also install the dev client, since this needs a real native build (not Expo Go):

```bash
npx expo install expo-dev-client
```

### 2. Add the config plugin

In `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "defaultChannel": "default"
        }
      ]
    ]
  }
}
```

### 3. Firebase project setup (required even for just testing)

The Firebase Console can only send a test push to a token if the app is registered with that Firebase project and has `google-services.json` wired in — this is what generates a valid FCM token in the first place.

1. Firebase Console → your project → Project Settings → Android app
   - If no Android app exists yet, add one using your `android.package` value from `app.json`
2. Download `google-services.json`
3. Place it in the project root
4. Reference it in `app.json`:

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json",
      "package": "com.yourcompany.bcdentistry"
    }
  }
}
```

> No EAS credentials or service account key needed for this phase — that's only required when Expo's Push Service relays messages on your behalf (Phase 2). Sending directly from the Firebase console talks to FCM directly.

### 4. Rebuild the native project

```bash
npx expo prebuild --clean
npx expo run:android
```

### 5. Get the token and log it to console

Add this minimal script — a temporary hook, not the full app integration yet:

```ts
// utils/getFcmToken.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export async function logFcmToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permission not granted');
    return;
  }

  // Raw FCM token — this is what the Firebase console test-send needs
  const token = (await Notifications.getDevicePushTokenAsync()).data;
  console.log('FCM DEVICE TOKEN:', token);
}
```

Call it once from `app/_layout.tsx` (temporary, just for this test):

```tsx
import { useEffect } from 'react';
import { logFcmToken } from '../utils/getFcmToken';

export default function RootLayout() {
  useEffect(() => {
    logFcmToken();
  }, []);

  // ...rest of existing layout
}
```

### 6. Copy the token from the terminal/Metro logs

Run the app, grant notification permission when prompted, and copy the full token string logged as `FCM DEVICE TOKEN: ...`.

### 7. Send a test push from Firebase Console

1. Firebase Console → your project → **Engage** → **Messaging** (Cloud Messaging)
2. Click **New campaign** → **Notifications**
3. Fill in title/body → **Send test message**
4. Paste the copied FCM token into the "Add an FCM registration token" field → **Test**
5. The notification should arrive on the device (foreground or background)

If it doesn't arrive:
- Confirm the app package name in `google-services.json` matches `android.package` in `app.json` exactly
- Confirm you ran a fresh `prebuild --clean` after adding `google-services.json`
- Confirm notification permission was actually granted (check device Settings if unsure)
- Foreground notifications may not show as a heads-up banner unless a notification handler is set — that's fine for this phase, background/killed-state delivery is the main thing to confirm

---

## Phase 2 (not yet — for later)

Once the raw FCM token test above works, the next steps are:

- Get the **Expo push token** (`getExpoPushTokenAsync`) instead of raw FCM token, so sending doesn't require touching FCM directly
- Upload FCM V1 service account credentials to EAS (`eas credentials`) so **Expo's** Push Service can relay on your behalf
- Build out `utils/notifications.ts` with full permission handling, channels, and foreground/response listeners
- Send the token to your backend, tied to the logged-in user
- Handle push receipts and token cleanup (`DeviceNotRegistered`)

These are documented in detail once Phase 1 is confirmed working — not needed yet.

---

## Phase 1b: iOS setup (via Expo Push Service, not raw FCM)

`getDevicePushTokenAsync()` returns a raw APNs token on iOS, not an FCM token — Firebase's console test-send won't accept it. So for iOS, we skip Firebase entirely and use Expo's push service instead, which talks to APNs directly.

### Requirements
- A paid **Apple Developer Program** membership ($99/yr) — required for push entitlements, even for testing
- A **physical iOS device** — the iOS Simulator cannot receive real remote push notifications
- An Apple **Push Notifications Auth Key** (`.p8`)

### 1. Enable the Push Notifications capability

If using EAS Build, this is usually handled automatically when you build, based on `app.json`. Make sure your iOS bundle identifier is set:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.bcdentistry",
      "supportsTablet": true
    }
  }
}
```

### 2. Generate an APNs Auth Key

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Keys**
2. Click **+**, name it (e.g. "Expo Push Key"), check **Apple Push Notifications service (APNs)**
3. Download the `.p8` file (you can only download it once — save it somewhere safe)
4. Note the **Key ID** and your **Team ID**

### 3. Upload the key to EAS

```bash
eas credentials
```

Select **iOS** → **Push Notifications: Manage your Apple Push Notifications Key** → upload the `.p8`, Key ID, and Team ID. EAS/Expo's push service uses this to talk to APNs on your behalf — you never touch APNs directly.

### 4. Build for a physical device

```bash
eas build --profile development --platform ios
```

Install the resulting build on your device (via EAS's QR code / TestFlight-style install), since a plain Expo Go install won't carry your push entitlement.

Alternatively, if you have a Mac with Xcode set up and a device connected:

```bash
npx expo run:ios --device
```

### 5. Get the Expo push token (not the raw device token)

Update the token-fetching logic to use `getExpoPushTokenAsync` instead of `getDevicePushTokenAsync` — this works identically for Android and iOS, and is what Expo's push service (and later, your backend) should use:

```ts
// utils/getExpoPushToken.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function logExpoPushToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permission not granted');
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('Missing EAS projectId — run `eas init` first');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  console.log('EXPO PUSH TOKEN:', token);
}
```

Call it the same way from `app/_layout.tsx` as the Android version.

### 6. Send a test push (works for both iOS and Android now)

Use the Expo push tool: https://expo.dev/notifications — paste in the `ExponentPushToken[...]` string and send.

Or via curl:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "iOS Test",
    "body": "Hello from bc-dentistry"
  }'
```

### Note on the Android FCM-console test from Phase 1

Once you're using `getExpoPushTokenAsync` for iOS, it's worth switching Android to the same function too — keeping one unified token type (Expo push token) for both platforms is much simpler for the backend work in Phase 2, rather than juggling raw FCM tokens for Android and Expo tokens for iOS. The Firebase-console-direct-send from Phase 1 was a useful one-off sanity check, but isn't the path you'll want long-term.

### Troubleshooting
- **No token generated / permission prompt never appears** — check the push entitlement was actually included in the build (rebuild if you added the capability after an earlier build)
- **Token generated but no notification arrives** — double check the APNs key, Key ID, and Team ID were entered correctly in `eas credentials`
- **Works on Android, not iOS** — almost always an APNs credentials issue, not an app code issue
