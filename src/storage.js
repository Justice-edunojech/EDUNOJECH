// Drop-in replacement for the Claude-artifact-only `window.storage` API,
// backed by the browser's localStorage — free, no signup, no backend.
//
// Trade-off: data lives only on this device/browser. If a teacher switches
// phones or clears browser data, saved lessons won't follow them. That's
// fine for getting started; swap this file for a Supabase client later
// if you want lessons to sync across a teacher's devices.

const PREFIX = "edunojech:";

export const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },

  async delete(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },
};
