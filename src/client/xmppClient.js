const { client } = require('@xmpp/client');
const { xml } = require('@xmpp/xml');
const { XMPP_HOST, XMPP_PORT, PARTY_PROD_DOMAIN, getPlatformPresence, FORTNITE_NET_CL } = require('../utils/constants');
const { createLogger } = require('../utils/logger');

const log = createLogger('XMPP');

// Errors that indicate a permanent connection failure (no point retrying)
const PERMANENT_ERRORS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN']);

class EpicXMPPClient {
  constructor(tokenManager, state) {
    this.tokenManager = tokenManager;
    this.state = state;
    this.xmpp = null;
    this.handlers = new Map();
    this.partyId = null;
    this._permanentFailure = false;
  }

  async connect() {
    const accountId = this.tokenManager.accountId;
    const token = this.tokenManager.accessToken;
    if (!accountId || !token) throw new Error('Missing token for XMPP');

    log.info('Connecting to XMPP...');

    this.xmpp = client({
      service: `xmpp://${XMPP_HOST}:${XMPP_PORT}`,
      domain: 'epicgames.com',
      username: accountId,
      password: token,
      resource: `V2:Fortnite:PC::${FORTNITE_NET_CL}`,
      timeout: 15000
    });

    this.xmpp.on('error', (err) => {
      const code = err?.code || '';
      log.error(`XMPP error: code=${code}, msg=${err?.message}`);

      // Kill the client on permanent failures to stop the reconnection loop
      if (PERMANENT_ERRORS.has(code)) {
        this._permanentFailure = true;
        this.state.update({ xmppStatus: 'blocked', online: false });
        this.state.pushLog('warn', 'XMPP server blocked — real-time party features unavailable.');

        // Stop the xmpp client entirely to prevent reconnect spam
        const x = this.xmpp;
        this.xmpp = null;
        x.stop().catch(() => {});
      }
    });

    this.xmpp.on('offline', () => {
      this.state.update({ online: false });
    });

    this.xmpp.on('stanza', async (stanza) => {
      try {
        await this.handleStanza(stanza);
      } catch (e) {
        log.error('Stanza handler error:', e.message);
      }
    });

    this.xmpp.on('online', async (address) => {
      if (this._permanentFailure) return; // already flagged as blocked
      log.info('XMPP online:', address.toString());
      this.state.update({ online: true, xmppStatus: 'connected' });
      this.state.pushLog('info', 'Bot online in Fortnite.');
      await this.sendPresence();
      await this.sendCapabilities();
    });

    this.xmpp.on('status', (status) => {
      log.debug('XMPP status:', status);
    });

    try {
      await this.xmpp.start();
      log.info('XMPP started successfully');
      return true;
    } catch (err) {
      const code = err?.code || '';
      // Kill client on permanent errors to prevent reconnect spam
      if (PERMANENT_ERRORS.has(code)) {
        this._permanentFailure = true;
        this.state.update({ xmppStatus: 'blocked', online: false });
        const x = this.xmpp;
        this.xmpp = null;
        x.stop().catch(() => {});
      }
      return false;
    }
  }

  async sendPresence(presenceOverride = null) {
    if (!this.xmpp) return;
    const p = presenceOverride || getPlatformPresence(this.tokenManager.accountId);
    const stanza = xml('presence', {}, xml('status', {}, JSON.stringify(p)));
    try {
      await this.xmpp.send(stanza);
    } catch (err) {
      log.error('sendPresence failed:', err.message);
    }
  }

  async sendCapabilities() {
    if (!this.xmpp) return;
    const caps = xml('iq', { type: 'get', id: 'roster_1' },
      xml('query', { xmlns: 'jabber:iq:roster' })
    );
    try {
      await this.xmpp.send(caps);
    } catch (err) {
      log.error('sendCapabilities failed:', err.message);
    }
  }

  async sendMessage(to, body, type = 'chat') {
    if (!this.xmpp) return;
    const stanza = xml('message', { to, type }, xml('body', {}, body));
    try {
      await this.xmpp.send(stanza);
    } catch (err) {
      log.error('sendMessage failed:', err.message);
    }
  }

  async sendPartyMessage(body) {
    if (!this.partyId) {
      this.state.pushLog('warn', 'Not in a party; cannot send party message.');
      return;
    }
    const to = `p-${this.partyId}@${PARTY_PROD_DOMAIN}`;
    await this.sendMessage(to, body, 'groupchat');
  }

  async sendPartyEvent(to, payload) {
    if (!this.xmpp) return;
    const stanza = xml('message', { to, type: 'groupchat' },
      xml('body', {}, JSON.stringify(payload))
    );
    try {
      await this.xmpp.send(stanza);
    } catch (err) {
      log.error('sendPartyEvent failed:', err.message);
    }
  }

  async handleStanza(stanza) {
    const name = stanza.name;
    if (name === 'message') {
      const body = stanza.getChildText('body');
      if (!body) return;
      try {
        const data = JSON.parse(body);
        this.dispatchNotification(data, stanza);
      } catch {
        const from = stanza?.attrs?.from;
        log.info('Message from', from, ':', body);
      }
    }
  }

  dispatchNotification(data, stanza) {
    const type = data.type;
    if (!type) return;

    if (type === 'com.epicgames.social.party.notification.v0.INITIAL_INVITE') {
      this.emit('partyInvite', data, stanza);
    } else if (type === 'com.epicgames.social.party.notification.v0.MEMBER_JOINED') {
      this.emit('memberJoined', data, stanza);
    } else if (type === 'com.epicgames.social.party.notification.v0.MEMBER_LEFT') {
      this.emit('memberLeft', data, stanza);
    } else if (type === 'com.epicgames.social.party.notification.v0.PARTY_UPDATED') {
      this.emit('partyUpdated', data, stanza);
    } else if (type === 'com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED') {
      this.emit('memberStateUpdated', data, stanza);
    }
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }

  emit(event, ...args) {
    for (const fn of this.handlers.get(event) || []) fn(...args);
  }

  async stop() {
    if (this.xmpp) {
      await this.xmpp.stop().catch(() => {});
      this.xmpp = null;
    }
  }
}

module.exports = EpicXMPPClient;
