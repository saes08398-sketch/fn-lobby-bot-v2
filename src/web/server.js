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

    // Get Epic authorization URL (user visits this in browser to get a code)
    this.app.get('/api/auth-url', (req, res) => {
      const { EPIC_CLIENT_ID } = require('../utils/constants');
      const url = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;
      res.json({ url });
    });

    // Exchange an authorization code for OAuth tokens
    this.app.post('/api/auth/exchange', async (req, res) => {
      try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Missing code' });

        const { exchangeCode } = require('../auth/exchangeCode');
        const token = await exchangeCode(code);

        // Save refresh token in state
        if (token.refresh_token) {
          this.state.update({ refreshToken: token.refresh_token });
          this.state.pushLog('info', 'Refresh token obtained. Copy it from the dashboard and set EPIC_REFRESH_TOKEN in Railway env vars for permanent auto-login.');
        }

        // Start the bot
        const client = this.clientFactory();
        this.currentClient = client;
        client.tokenManager.set(token);
        await client.start();

        res.json({ ok: true, displayName: token.displayName || 'Unknown', accountId: token.account_id });
      } catch (e) {
        log.error('Code exchange failed:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    // Get the current refresh token (for user to copy into env vars)
    this.app.get('/api/refresh-token', (req, res) => {
      const s = this.state.get();
      res.json({ refreshToken: s.refreshToken || null });
    });

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
      autoAccept: this.currentClient?.party?.autoAccept ?? ((process.env.AUTO_ACCEPT_INVITES || 'true').toLowerCase() === 'true'),
      hasRefreshToken: !!s.refreshToken,
      xmppStatus: s.xmppStatus || 'disconnected',
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
