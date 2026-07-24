const axios = require('axios');
const qs = require('querystring');
const { EPIC_CLIENT_ID, EPIC_CLIENT_SECRET, EPIC_OAUTH_HOST } = require('../utils/constants');
const { createLogger } = require('../utils/logger');

const log = createLogger('ExchangeCode');

const TOKEN_URL = `${EPIC_OAUTH_HOST}/account/api/oauth/token`;

function getBasicAuth() {
  return 'Basic ' + Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64');
}

/**
 * Exchange an authorization code for OAuth tokens.
 * The code is obtained by visiting:
 *   https://www.epicgames.com/id/api/redirect?clientId=CLIENT_ID&responseType=code
 * while logged into epicgames.com in a browser.
 * The redirect URL will contain ?code=XXX — paste that entire URL or just the code here.
 */
async function exchangeCode(code) {
  // Extract just the code if a full URL was pasted
  let cleanCode = code;
  if (code.includes('code=')) {
    const match = code.match(/[?&]code=([^&]+)/);
    if (match) cleanCode = decodeURIComponent(match[1]);
  }

  log.info('Exchanging authorization code for tokens...');

  const { data } = await axios.post(TOKEN_URL, qs.stringify({
    grant_type: 'authorization_code',
    code: cleanCode,
    client_id: EPIC_CLIENT_ID
  }), {
    headers: {
      Authorization: getBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  log.info('Token exchange successful');
  return data;
}

async function requestToken(grantType, value) {
  const body = { grant_type: grantType };
  if (grantType === 'refresh_token') body.refresh_token = value;
  else if (grantType === 'exchange_code') body.exchange_code = value;
  else if (grantType === 'authorization_code') body.code = value;

  const { data } = await axios.post(TOKEN_URL, qs.stringify(body), {
    headers: {
      Authorization: getBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return data;
}

module.exports = { exchangeCode, requestToken };
