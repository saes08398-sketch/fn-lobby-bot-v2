const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { createLogger } = require('../utils/logger');

const log = createLogger('Web');

class WebServer {
  constructor(state, clientFactory) {
    this.state = state;
    this.clientFactory = clientFactory; // function to create a new EpicClient
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Set();
    this.currentClient = null;
  }

  setup() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));

    this.app.get('/api/status', (req, res) => {
      res.json(this.sanitizedStatus());
    });

    this.app.get('/api/login', async (req, res) => {
      try {
        const { requestDeviceCode } = require('../auth/deviceCode');
        const deviceCode = await requestDeviceCode();
        this.state.update({
          deviceCode: deviceCode.user_code,
          deviceCodeUrl: deviceCode.verification_uri,
          loginLink: `${deviceCode.verification_uri_complete || deviceCode.verification_uri}?user_code=${deviceCode.user_code}`
        });
        this.state.pushLog('info', `Login code: ${deviceCode.user_code}`);

        // Start polling in the background.
        this.startAuthFlow(deviceCode);

        res.json({
          user_code: deviceCode.user_code,
          verification_uri: deviceCode.verification_uri,
          login_link: this.state.get().loginLink,
          expires_in: deviceCode.expires_in
        });
      } catch (e) {
        log.error('Device code request failed:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    // Email/password login removed — Epic requires captcha, making it unusable.
    // Use device-code flow instead (GET /api/login).

    this.app.post('/api/equip', async (req, res) => {
      if (!this.currentClient || !this.currentClient.cosmetics) {
        return res.status(400).json({ error: 'Bot not authenticated' });
      }
      try {
        const { type, id, section } = req.body;
        let result;
        if (type === 'skin') result = await this.currentClient.cosmetics.equipSkin(id);
        else if (type === 'emote') result = await this.currentClient.cosmetics.playEmote(id, section || 'Emote1');
        else if (type === 'backpack') result = await this.currentClient.cosmetics.equipBackpack(id);
        else if (type === 'pickaxe') result = await this.currentClient.cosmetics.equipPickaxe(id);
        else if (type === 'loadout') result = await this.currentClient.cosmetics.setLoadout(req.body);
        else return res.status(400).json({ error: 'Unknown equip type' });
        res.json({ ok: true, result });
      } catch (e) {
        log.error('Equip failed:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/api/accept-invites', (req, res) => {
      if (!this.currentClient || !this.currentClient.party) {
        return res.status(400).json({ error: 'Bot not authenticated' });
      }
      const value = req.body.enabled;
      this.currentClient.party.setAutoAccept(value);
      res.json({ autoAccept: this.currentClient.party.autoAccept });
    });

    this.app.post('/api/message', async (req, res) => {
      if (!this.currentClient || !this.currentClient.party) {
        return res.status(400).json({ error: 'Bot not authenticated' });
      }
      try {
        await this.currentClient.party.sendPartyMessage(req.body.text || 'Hello from FN Lobby Bot');
        res.json({ ok: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/api/disconnect', async (req, res) => {
      if (this.currentClient) {
        await this.currentClient.stop();
        this.currentClient = null;
      }
      res.json({ ok: true });
    });

    // WebSocket updates.
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: 'state', data: this.sanitizedStatus() }));
      ws.on('close', () => this.clients.delete(ws));
    });

    this.state.on((snap) => {
      const payload = JSON.stringify({ type: 'state', data: this.sanitizedStatus(snap) });
      for (const ws of this.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    });
  }

  async startAuthFlow(deviceCode) {
    try {
      const client = this.clientFactory();
      this.currentClient = client;
      await client.authenticateWithDeviceCode(deviceCode);
      await client.start();
    } catch (e) {
      log.error('Auth flow failed:', e.message);
      this.state.pushLog('error', `Auth failed: ${e.message}`);
    }
  }

  sanitizedStatus(snap) {
    const s = snap || this.state.get();
    return {
      online: s.online,
      authenticated: s.authenticated,
      accountId: s.accountId,
      displayName: s.displayName,
      partyId: s.partyId,
      partyMembers: s.partyMembers,
      currentSkin: s.currentSkin,
      currentEmote: s.currentEmote,
      deviceCode: s.deviceCode,
      deviceCodeUrl: s.deviceCodeUrl,
      loginLink: s.loginLink,
      autoAccept: this.currentClient?.party?.autoAccept ?? ((process.env.AUTO_ACCEPT_INVITES || 'true').toLowerCase() === 'true'),
      logs: s.logs.slice(-50)
    };
  }

  listen(port) {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        log.info(`Dashboard listening on http://localhost:${port}`);
        resolve();
      });
    });
  }
}

module.exports = WebServer;
