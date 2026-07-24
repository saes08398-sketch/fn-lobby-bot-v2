require('dotenv').config();

const EpicClient = require('./client/epicClient');
const WebServer = require('./web/server');
const state = require('./utils/state');
const { createLogger } = require('./utils/logger');
const { validateCredentials } = require('./utils/constants');

const log = createLogger('Main');

const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  state.pushLog('error', `Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
  state.pushLog('error', `Uncaught exception: ${err.message}`);
  process.exit(1);
});

async function main() {
  log.info('Starting FN Lobby Bot...');
  validateCredentials();

  const webServer = new WebServer(state, () => new EpicClient(state));
  webServer.setup();
  await webServer.listen(PORT);

  // If refresh token exists in environment, try to log in automatically.
  if (process.env.EPIC_REFRESH_TOKEN) {
    try {
      const client = new EpicClient(state);
      webServer.currentClient = client;
      await client.authenticateWithRefresh(process.env.EPIC_REFRESH_TOKEN);
      await client.start();
      log.info('Auto-logged in with refresh token.');
    } catch (e) {
      log.error('Auto-login failed:', e.message);
      state.pushLog('error', `Auto-login failed: ${e.message}`);
    }
  } else {
    log.info('No refresh token found. Use the dashboard to log in with a device code.');
  }

  process.on('SIGINT', async () => {
    log.info('Shutting down...');
    if (webServer.currentClient) await webServer.currentClient.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  log.error('Fatal error:', e);
  process.exit(1);
});
