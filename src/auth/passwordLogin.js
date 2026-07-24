const axios = require('axios');
const qs = require('querystring');
const { EPIC_TOKEN, EPIC_CLIENT_ID, EPIC_CLIENT_SECRET } = require('../utils/constants');
const { createLogger } = require('../utils/logger');

const log = createLogger('PasswordLogin');

const CSRF_URL = 'https://www.epicgames.com/id/api/csrf';
const LOGIN_URL = 'https://www.epicgames.com/id/api/login';
const EXCHANGE_URL = 'https://www.epicgames.com/id/api/exchange';

function getBasicAuth() {
  return 'Basic ' + Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64');
}

async function getCsrfCookie() {
  const res = await axios.get(CSRF_URL, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    withCredentials: true
  });

  // Parse the XSRF-TOKEN cookie manually.
  const cookies = res.headers['set-cookie'] || [];
  for (const cookie of cookies) {
    if (cookie.includes('XSRF-TOKEN=')) {
      const match = cookie.match(/XSRF-TOKEN=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  throw new Error('Failed to obtain XSRF token');
}

async function loginWithEmailPassword(email, password) {
  const xsrf = await getCsrfCookie();
  log.info('XSRF token obtained, attempting login...');

  const cookieJar = `XSRF-TOKEN=${encodeURIComponent(xsrf)}`;

  try {
    const loginRes = await axios.post(LOGIN_URL, {
      email,
      password,
      rememberMe: true
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': xsrf,
        'Cookie': cookieJar
      }
    });

    log.info('Login response received, fetching exchange code...');

    // Login sets cookies; use them to get an exchange code.
    const exchangeRes = await axios.get(EXCHANGE_URL, {
      headers: {
        'Accept': 'application/json',
        'Cookie': loginRes.headers['set-cookie']?.join('; ') || cookieJar
      }
    });

    const exchangeCode = exchangeRes.data?.code;
    if (!exchangeCode) throw new Error('No exchange code returned');

    log.info('Exchange code received, fetching OAuth token...');

    const tokenRes = await axios.post(EPIC_TOKEN, qs.stringify({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode
    }), {
      headers: {
        Authorization: getBasicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return tokenRes.data;
  } catch (err) {
    const data = err?.response?.data;
    const errorCode = data?.errorCode || data?.errorCode || data?.message;
    const message = data?.message || err.message;
    log.error('Password login failed:', errorCode, message);
    throw new Error(`Password login failed: ${errorCode || message}`);
  }
}

module.exports = { loginWithEmailPassword };
