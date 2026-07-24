const axios = require('axios');
const qs = require('querystring');
const { EPIC_CLIENT_ID, EPIC_CLIENT_SECRET, EPIC_OAUTH_HOST } = require('../utils/constants');

const DEVICE_AUTH_URL = `${EPIC_OAUTH_HOST}/account/api/oauth/deviceAuthorization`;
const TOKEN_URL = `${EPIC_OAUTH_HOST}/account/api/oauth/token`;

function getBasicAuth() {
  return 'Basic ' + Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64');
}

async function requestDeviceCode() {
  const { data } = await axios.post(DEVICE_AUTH_URL, qs.stringify({}), {
    headers: {
      Authorization: getBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return data;
}

async function requestToken(grantType, value) {
  const body = { grant_type: grantType };
  if (grantType === 'device_code') body.device_code = value;
  else if (grantType === 'refresh_token') body.refresh_token = value;
  else if (grantType === 'exchange_code') body.exchange_code = value;

  const { data } = await axios.post(TOKEN_URL, qs.stringify(body), {
    headers: {
      Authorization: getBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return data;
}

async function pollDeviceCode(deviceCode, intervalSeconds = 5) {
  const start = Date.now();
  const expiresInMs = deviceCode.expires_in * 1000;

  while (Date.now() - start < expiresInMs) {
    try {
      const token = await requestToken('device_code', deviceCode.device_code);
      return token;
    } catch (err) {
      const code = err?.response?.data?.errorCode;
      if (
        code === 'errors.com.epicgames.account.oauth.authorization_pending' ||
        code === 'errors.com.epicgames.not_found'
      ) {
        // still waiting
      } else if (code === 'errors.com.epicgames.account.oauth.authorization_expired') {
        throw new Error('Device code expired before login.');
      } else {
        throw err;
      }
    }
    await new Promise(r => setTimeout(r, intervalSeconds * 1000));
  }
  throw new Error('Device code timed out.');
}

async function verifyToken(accessToken) {
  const { data } = await axios.get(`${EPIC_OAUTH_HOST}/account/api/oauth/verify`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return data;
}

module.exports = {
  requestDeviceCode,
  requestToken,
  pollDeviceCode,
  verifyToken
};
