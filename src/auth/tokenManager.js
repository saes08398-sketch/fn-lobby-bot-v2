const { requestToken, verifyToken } = require('./deviceCode');

class TokenManager {
  constructor(state) {
    this.state = state;
    this.token = null;
  }

  set(token) {
    this.token = token;
    this.state.update({
      authenticated: true,
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      accountId: token.account_id,
      displayName: token.displayName || token.account_id
    });
  }

  get() {
    return this.token;
  }

  get accessToken() {
    return this.token?.access_token;
  }

  get accountId() {
    return this.token?.account_id;
  }

  async refresh() {
    if (!this.token?.refresh_token) throw new Error('No refresh token available');
    const fresh = await requestToken('refresh_token', this.token.refresh_token);
    this.set(fresh);
    return fresh;
  }

  async verify() {
    return verifyToken(this.accessToken);
  }

  needsRefresh(bufferSeconds = 300) {
    if (!this.token) return true;
    return Date.now() >= this.state.get().expiresAt - bufferSeconds * 1000;
  }
}

module.exports = TokenManager;
