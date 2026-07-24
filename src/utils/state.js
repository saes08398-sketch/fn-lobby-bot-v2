/**
 * Lightweight state store shared by the client and the web dashboard.
 */
class BotState {
  constructor() {
    this.state = {
      online: false,
      authenticated: false,
      accountId: null,
      displayName: null,
      accessToken: null,
      expiresAt: null,
      partyId: null,
      partyMembers: [],
      currentSkin: null,
      currentEmote: null,
      refreshToken: null,
      logs: [],
      inviteQueue: [],
      friends: []
    };
    this.listeners = new Set();
  }

  get() {
    return { ...this.state };
  }

  update(patch) {
    Object.assign(this.state, patch);
    this.emit();
  }

  pushLog(level, message) {
    const entry = { time: Date.now(), level, message: String(message) };
    this.state.logs.push(entry);
    if (this.state.logs.length > 200) this.state.logs.shift();
    this.emit();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snap = this.get();
    for (const fn of this.listeners) {
      try { fn(snap); } catch (e) { /* ignore */ }
    }
  }
}

module.exports = new BotState();
