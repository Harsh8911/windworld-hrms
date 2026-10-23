import * as SecureStore from "expo-secure-store";

import type { AuthenticationResponse } from "../types/api";

const ACCESS_TOKEN_KEY = "windworld.accessToken";
const REFRESH_TOKEN_KEY = "windworld.refreshToken";

// SecureStore is unavailable on web; keeping tokens in memory avoids insecure
// persistent browser storage while still allowing local web development.
const memoryStorage = new Map<string, string>();

async function setItem(key: string, value: string) {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return;
  }

  memoryStorage.set(key, value);
}

async function getItem(key: string) {
  if (await SecureStore.isAvailableAsync()) {
    return SecureStore.getItemAsync(key);
  }

  return memoryStorage.get(key) ?? null;
}

async function deleteItem(key: string) {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(key);
  }

  memoryStorage.delete(key);
}

export async function saveAuthentication(authentication: AuthenticationResponse) {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, authentication.accessToken),
    setItem(REFRESH_TOKEN_KEY, authentication.refreshToken),
  ]);
}

export async function getAuthenticationTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    getItem(ACCESS_TOKEN_KEY),
    getItem(REFRESH_TOKEN_KEY),
  ]);

  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function clearAuthentication() {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
}
