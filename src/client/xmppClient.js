const { client } = require('@xmpp/client');
const { xml } = require('@xmpp/xml');
const { XMPP_HOST, XMPP_PORT, PARTY_PROD_DOMAIN, getPlatformPresence, FORTNITE_NET_CL } = require('../utils/constants');
const { createLogger } = require('../utils/logger');

const log = createLogger('XMPP');

class EpicXMPPClient {
  constructor(tokenManager, state) {
    this.tokenManager = tokenManager;
    this.state = state;
    this.xmpp = null;
    this.handlers = new Map();
    this.partyId = null;
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
      timeout: 30000
    });

    this.xmpp.on('error', (err) => {
      log.error('XMPP error:', JSON.stringify(err), 'msg:', err?.message, 'code:', err?.code, 'errno:', err?.errno, 'syscall:', err?.syscall, 'name:', err?.name);
      this.state.pushLog('error', `XMPP error: code=${err?.code}, msg=${err?.message}`);
    });

    this.xmpp.on('offline', () => {
      this.state.update({ online: false });
      this.state.pushLog('warn', 'XMPP disconnected.');
    });

    this.xmpp.on('stanza', async (stanza) => {
      try {
        await this.handleStanza(stanza);
      } catch (e) {
        log.error('Stanza handler error:', e.message);
      }
    });

    this.xmpp.on('online', async (address) => {
      log.info('XMPP online:', address.toString());
      this.state.update({ online: true });
      this.state.pushLog('info', 'Bot online in Fortnite.');
      await this.sendPresence();
      await this.sendCapabilities();
    });

    this.xmpp.on('status', (status) => {
      log.info('XMPP status:', status);
    });

    try {
      await this.xmpp.start();
      log.info('XMPP started successfully');
    } catch (err) {
      log.error('XMPP start failed:', JSON.stringify(err), 'msg:', err?.message, 'code:', err?.code, 'errno:', err?.errno, 'syscall:', err?.syscall);
      this.state.pushLog('error', `XMPP start failed: code=${err?.code}, msg=${err?.message}`);
      throw err;
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
