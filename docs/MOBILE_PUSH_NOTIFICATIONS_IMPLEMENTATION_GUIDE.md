# Mobile Push Notifications Implementation Guide

## Purpose

This guide describes the mobile work required to receive Firebase Cloud
Messaging (FCM) notifications from the EDR backend, associate each installation
with the authenticated EDR account, and navigate to the relevant data request
when a notification is opened.

The current mobile project uses Expo SDK 52. Because the backend sends directly
through Firebase Admin, the mobile application must register an **FCM
registration token**. Do not upload an Expo Push Token or a raw APNs device
token to the EDR API.

## 1. Firebase and native project setup

Ask the client for access to the same Firebase project used by the EDR backend
and web application.

Required configuration:

- Android Firebase app with a package name matching the mobile build.
- `google-services.json` for Android.
- iOS Firebase app with a bundle ID matching the mobile build.
- `GoogleService-Info.plist` for iOS.
- An Apple APNs authentication key uploaded under Firebase Console > Project
  Settings > Cloud Messaging for iOS delivery.
- Firebase Cloud Messaging API enabled.

Use React Native Firebase Messaging so both Android and iOS produce tokens that
Firebase Admin can target:

```bash
npx expo install @react-native-firebase/app @react-native-firebase/messaging
npx expo install expo-notifications expo-device
```

Add the React Native Firebase config plugins and Firebase configuration-file
paths to `app.json` or `app.config.js`. Follow the current Expo and React Native
Firebase setup instructions for the versions selected by the mobile developer.

This requires an Expo development build or EAS/native build. It will not work
inside Expo Go because React Native Firebase contains native modules.

References:

- https://docs.expo.dev/guides/using-push-notifications-services/
- https://rnfirebase.io/messaging/usage
- https://firebase.google.com/docs/cloud-messaging/android/get-started
- https://firebase.google.com/docs/cloud-messaging/ios/get-started

## 2. Backend API contract

Use the authenticated Blockchain API base URL already configured by the mobile
application.

### Register or refresh an installation

```http
POST /push/subscriptions
Authorization: Bearer <EDR JWT>
Content-Type: application/json
```

Android:

```json
{
  "platform": "android",
  "token": "<FCM registration token>",
  "deviceLabel": "Samsung S24"
}
```

iOS:

```json
{
  "platform": "ios",
  "token": "<FCM registration token>",
  "deviceLabel": "Dijoo's iPhone"
}
```

Successful response:

```json
{
  "success": true,
  "data": {
    "registered": true,
    "subscriptionID": 42
  }
}
```

The backend derives the account role and recipient ID from the verified JWT.
The mobile app must not send a patient, doctor, clinic, or user ID in the
registration request.

### Unregister the current installation

Call this before clearing the JWT during explicit logout:

```http
DELETE /push/subscriptions
Authorization: Bearer <EDR JWT>
Content-Type: application/json

{
  "token": "<current FCM registration token>"
}
```

### List the account's active devices

```http
GET /push/subscriptions
Authorization: Bearer <EDR JWT>
```

The response contains subscription IDs, platforms, labels, and timestamps. It
does not expose Firebase tokens.

### Revoke one of the account's devices

```http
DELETE /push/subscriptions/<subscriptionID>
Authorization: Bearer <EDR JWT>
```

The backend checks that the subscription belongs to the authenticated account.

## 3. Registration lifecycle

Implement one reusable function, for example
`synchronizePushRegistration()`, with this sequence:

1. Confirm that a valid authenticated EDR session exists.
2. Ask for notification permission when appropriate.
3. On iOS, register the device for remote messages and wait until APNs is
   available through the Firebase SDK.
4. Call React Native Firebase Messaging `getToken()` to obtain the FCM token.
5. Submit the token to `POST /push/subscriptions`.
6. Store the returned `subscriptionID`, token, authenticated account key, and
   last synchronization timestamp in secure local storage.

Call this function:

- after successful sign-in;
- when the app starts with a valid existing session;
- when the app returns to the foreground if the last synchronization is older
  than 24 hours;
- whenever `messaging().onTokenRefresh(...)` returns a replacement token;
- whenever the signed-in account changes.

Example outline:

```js
import messaging from '@react-native-firebase/messaging';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function synchronizePushRegistration(authToken) {
  await messaging().registerDeviceForRemoteMessages();

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') return null;

  if (Platform.OS === 'ios') {
    const apnsToken = await messaging().getAPNSToken();
    if (!apnsToken) {
      throw new Error('APNs registration is not ready; retry when the app becomes active');
    }
  }

  const fcmToken = await messaging().getToken();

  const response = await fetch(blockchainUrl('/push/subscriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform: Platform.OS,
      token: fcmToken,
      deviceLabel: Device.deviceName || `${Platform.OS} device`,
    }),
  });

  if (!response.ok) {
    throw new Error('Unable to register mobile push notifications');
  }

  return response.json();
}
```

Do not log the FCM token, JWT, or complete notification payload in production.

Register the token-refresh listener once at application startup:

```js
const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
  const authToken = await getValidAuthToken();
  if (!authToken) return;
  await uploadPushToken(authToken, newToken);
});
```

## 4. Push payload

The backend sends privacy-safe notification text plus routing identifiers:

```json
{
  "notification": {
    "title": "Your consent is required",
    "body": "Open EDR to review and respond."
  },
  "data": {
    "notificationID": "NOTIFICATION:abc123:PATIENT_CONSENT",
    "notificationType": "ACCESS_REQUEST_PENDING_PATIENT",
    "requestID": "abc123",
    "deepLink": "/my-record?requestId=abc123"
  }
}
```

The `deepLink` value is the web destination. Mobile navigation must use
`notificationType` and `requestID`; it should not attempt to open the web route
inside the native application.

The push does not contain doctor names, patient identifiers, clinical details,
or request purposes. Retrieve the full request from the authenticated API after
the app opens.

## 5. Notification handling

Register all three handlers:

### Foreground message

`messaging().onMessage(...)` runs while the app is open. Refresh the in-app
request/notification state and optionally show an in-app banner. Avoid showing
a duplicate system notification if the application already displays a banner.

```js
const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
  await refreshRequests();
  showInAppNotification(remoteMessage.notification);
});
```

### Background or terminated message

Register `setBackgroundMessageHandler(...)` at the application entry point,
outside React components. Keep the handler lightweight. The system displays the
notification payload while the app is backgrounded.

```js
messaging().setBackgroundMessageHandler(async () => {
  // Do not fetch sensitive clinical data in the background.
  // The foreground screen will refresh after the app opens.
});
```

### Notification opened

Handle both:

- `onNotificationOpenedApp(...)` for an app opened from the background;
- `getInitialNotification()` for an app launched from a terminated state.

```js
function openPushDestination(remoteMessage) {
  const { notificationType, requestID } = remoteMessage?.data || {};

  if (notificationType === 'ACCESS_REQUEST_PENDING_PATIENT' && requestID) {
    router.push({
      pathname: '/(tabs)/requests',
      params: { requestId: requestID },
    });
    return;
  }

  router.push('/(tabs)/requests');
}

const unsubscribeOpened = messaging().onNotificationOpenedApp(
  openPushDestination
);

const initialMessage = await messaging().getInitialNotification();
if (initialMessage) openPushDestination(initialMessage);
```

Do not navigate until authentication/session restoration and Expo Router are
ready. If the JWT is missing or expired, save the intended
`notificationType/requestID`, show sign-in, and resume navigation only after a
successful login.

## 6. Request-detail behavior

When `/(tabs)/requests?requestId=abc123` opens:

1. Read `requestId` from Expo Router parameters.
2. Fetch requests through the authenticated patient request API.
3. Locate the matching request.
4. Confirm that it belongs to the authenticated patient.
5. Open or highlight it.
6. Show full requesting-party details from the authenticated response.
7. If it no longer exists or is no longer actionable, show a clear
   "request unavailable or already processed" state.

Never trust identifiers or details from the push as authorization. The backend
and blockchain remain authoritative.

## 7. Logout and account switching

On explicit logout:

1. Get the currently stored FCM token.
2. Call `DELETE /push/subscriptions` while the JWT is still available.
3. Clear the locally stored subscription ID and account association.
4. Clear the EDR JWT/session.

If logout removal fails because the device is offline, store a pending cleanup
marker. At the next authenticated startup, upload the current token for the new
account. The backend's unique-token rule will reassign it from the previous
account.

Do not call Firebase `deleteToken()` merely to sign out unless the product
decision is to disable notifications for the entire app installation. Server
unregistration is sufficient and permits efficient re-registration after the
next sign-in.

## 8. Required tests

The developer should provide evidence for:

- Android and iOS permission accepted and denied.
- Token registered after sign-in.
- Existing token refreshed during authenticated startup.
- `onTokenRefresh` replacement uploaded successfully.
- Explicit logout removes the server subscription.
- Account A to Account B switching reassigns the same installation.
- Patient-consent notification received in foreground.
- Notification received while backgrounded.
- Notification opens the correct request from background.
- Notification opens the correct request from a terminated app.
- Expired session redirects to sign-in and resumes the intended request.
- Processed/missing request shows a safe unavailable state.
- Two devices signed into the same account both receive the event.
- Revoking one device stops delivery to that device without affecting the
  other.
- Push content displayed on the lock screen contains no patient or clinical
  details.

Test on real Android and iOS devices. Simulator/emulator behavior alone is not
sufficient evidence for APNs and production FCM delivery.
