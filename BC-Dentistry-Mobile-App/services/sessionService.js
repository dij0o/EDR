import { tokenStorage } from './tokenStorage';

class SessionService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.isLoading = true;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  getState() {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      user: this.user,
      isLoading: this.isLoading,
      isAuthenticated: Boolean(this.accessToken && this.user),
    };
  }

  async initSession() {
    this.isLoading = true;
    this.notify();

    try {
      const { accessToken, refreshToken, user } = await tokenStorage.getSession();
      if (accessToken && user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = user;
      } else {
        await tokenStorage.clearSession();
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
      }
    } catch (error) {
      console.error('[SessionService] Failed to restore session:', error);
      await tokenStorage.clearSession();
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  async setSession({ accessToken, refreshToken, user }) {
    if (accessToken !== undefined) this.accessToken = accessToken;
    if (refreshToken !== undefined) this.refreshToken = refreshToken;
    if (user !== undefined) this.user = user;

    await tokenStorage.saveSession({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      user: this.user,
    });

    this.notify();
  }

  async clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    await tokenStorage.clearSession();
    this.notify();
  }
}

export const sessionService = new SessionService();
