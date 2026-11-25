import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Tiny persistent key/value store for non-sensitive UI preferences (such as
 * the selected language). Uses the device keystore on native, where
 * expo-secure-store is already a dependency, and localStorage on web.
 * Failures are swallowed: a preference must never break the app.
 */

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function webStorage(): WebStorageLike | null {
  try {
    return (globalThis as { localStorage?: WebStorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export async function readPreference(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return webStorage()?.getItem(key) ?? null;
    if (!(await SecureStore.isAvailableAsync())) return null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writePreference(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(key, value);
      return;
    }
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Not persisted; the in-memory value still applies for this session.
  }
}
