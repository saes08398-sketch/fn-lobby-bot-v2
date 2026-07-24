const TokenManager = require('../auth/tokenManager');
const EpicXMPPClient = require('./xmppClient');
const PartyManager = require('./partyManager');
const CosmeticsManager = require('./cosmeticsManager');
const FortniteAPI = require('./fortniteAPI');
const { createLogger } = require('../utils/logger');

const log = createLogger('EpicClient');

class EpicClient {
  constructor(state) {
    this.state = state;
    this.tokenManager = new TokenManager(state);
    this.api = new FortniteAPI(this.tokenManager);
    this.xmpp = null;
    this.party = null;
    this.cosmetics = null;
    this.intervals = [];
  }

  async authenticateWithRefresh(refreshToken) {
    const { requestToken } = require('../auth/exchangeCode');
    const token = await requestToken('refresh_token', refreshToken);
    this.tokenManager.set(token);
    this.state.pushLog('info', `Authenticated via refresh as ${token.displayName || token.account_id}`);
    if (token.refresh_token) {
      log.info('Refresh token updated.');
    }
    return token;
  }

  async start() {
    // Load friends list.
    try {
      const friends = await this.api.getFriends();
      this.state.update({ friends: friends.friends || [] });
    } catch (e) {
      log.warn('Could not load friends list:', e.message);
    }

    // Initialize cosmetics manager.
    this.cosmetics = new CosmeticsManager(this.tokenManager, this.state);
    await this.cosmetics.init();

    // Connect XMPP (non-fatal if it fails — some hosts block Epic's XMPP server).
    try {
      this.xmpp = new EpicXMPPClient(this.tokenManager, this.state);
      await this.xmpp.connect();
      this.cosmetics.bindXMPP(this.xmpp);
      this.party = new PartyManager(this.xmpp, this.api, this.state);
    } catch (e) {
      log.warn('XMPP connection failed — bot will run without real-time features:', e.message);
      this.state.pushLog('warn', 'XMPP unavailable. Party invite auto-accept and presence will not work.');
      this.state.update({ xmppStatus: 'blocked' });
    }

    // Equip defaults.
    await this.applyDefaults();

    // Re-send in-game presence periodically (only if XMPP connected).
    if (this.xmpp) {
      this.intervals.push(setInterval(() => {
        this.xmpp.sendPresence().catch(() => {});
      }, 60000));
    }

    // Refresh access token before it expires.
    this.intervals.push(setInterval(async () => {
      if (this.tokenManager.needsRefresh()) {
        try {
          log.info('Access token expiring soon; refreshing...');
          await this.tokenManager.refresh();
        } catch (e) {
          log.error('Token refresh failed:', e.message);
          this.state.pushLog('error', `Token refresh failed: ${e.message}`);
        }
      }
    }, 60000));
  }

  async applyDefaults() {
    const defaults = {};
    if (process.env.DEFAULT_SKIN) defaults.skin = process.env.DEFAULT_SKIN;
    if (process.env.DEFAULT_EMOTE) defaults.emote = process.env.DEFAULT_EMOTE;
    if (Object.keys(defaults).length) {
      try {
        await this.cosmetics.setLoadout(defaults);
      } catch (e) {
        log.warn('Failed to apply default loadout:', e.message);
      }
    }
  }

  async stop() {
    for (const id of this.intervals) clearInterval(id);
    this.intervals = [];
    if (this.xmpp) {
      await this.xmpp.stop();
      this.xmpp = null;
    }
    this.state.update({ online: false, authenticated: false, partyId: null, partyMembers: [] });
  }
}

module.exports = EpicClient;
