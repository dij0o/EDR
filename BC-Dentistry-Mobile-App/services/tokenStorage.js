import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  ACCESS_TOKEN: 'edr_access_token',
  REFRESH_TOKEN: 'edr_refresh_token',
  USER_DATA: 'edr_user_data',
};

// NOTE: The localStorage fallback for Web is provided for browser development compatibility only.
// It DOES NOT provide equivalent security to native SecureStore (Keychain on iOS / Keystore on Android).
// Web localStorage is accessible via XSS and is not encrypted at rest.
async function getItem(key) {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`[tokenStorage] Error reading ${key}:`, error);
    return null;
  }
}

async function setItem(key, value) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`[tokenStorage] Error saving ${key}:`, error);
  }
}

async function deleteItem(key) {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`[tokenStorage] Error deleting ${key}:`, error);
  }
}

export const tokenStorage = {
  async saveSession({ accessToken, refreshToken, user }) {
    if (accessToken) await setItem(KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) await setItem(KEYS.REFRESH_TOKEN, refreshToken);
    if (user) await setItem(KEYS.USER_DATA, JSON.stringify(user));
  },

  async getSession() {
    const accessToken = await getItem(KEYS.ACCESS_TOKEN);
    const refreshToken = await getItem(KEYS.REFRESH_TOKEN);
    const rawUser = await getItem(KEYS.USER_DATA);
    let user = null;
    if (rawUser) {
      try {
        user = JSON.parse(rawUser);
      } catch (e) {
        user = null;
      }
    }
    return { accessToken, refreshToken, user };
  },

  async clearSession() {
    await deleteItem(KEYS.ACCESS_TOKEN);
    await deleteItem(KEYS.REFRESH_TOKEN);
    await deleteItem(KEYS.USER_DATA);
  },
};
