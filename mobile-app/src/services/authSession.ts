import {
  ApiError,
  getCurrentUser,
  logout,
} from "./api";
import {
  clearAuthentication,
  getAuthenticationTokens,
} from "./authStorage";
import type { UserRole } from "../types/api";

export async function restoreSession(): Promise<UserRole | null> {
  const tokens = await getAuthenticationTokens();

  if (!tokens) return null;

  try {
    const user = await getCurrentUser();
    return user.role;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearAuthentication();
    }
    return null;
  }
}

export async function endSession(): Promise<void> {
  const tokens = await getAuthenticationTokens();

  try {
    if (tokens?.refreshToken) {
      await logout(tokens.refreshToken);
    }
  } finally {
    await clearAuthentication();
  }
}
