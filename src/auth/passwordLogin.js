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

async function loginWithEmailPassword(email, password) {
  try {
    // Step 1: Get CSRF token
    log.info('Fetching CSRF token...');
    const csrfRes = await axios.get(CSRF_URL, {
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.epicgames.com/id/login',
        'Origin': 'https://www.epicgames.com'
      },
      maxRedirects: 0,
      validateStatus: () => true
    });

    // Extract all cookies from response
    const cookies = csrfRes.headers['set-cookie'] || [];
    let xsrfToken = null;
    const cookieJar = [];
    
    for (const cookie of cookies) {
      const match = cookie.match(/XSRF-TOKEN=([^;]+)/);
      if (match) {
        xsrfToken = decodeURIComponent(match[1]);
      }
      // Store all cookies
      const cookieMatch = cookie.match(/^([^=]+)=([^;]+)/);
      if (cookieMatch) {
        cookieJar.push(`${cookieMatch[1]}=${cookieMatch[2]}`);
      }
    }

    if (!xsrfToken) {
      throw new Error('Failed to obtain XSRF token from cookies: ' + cookies.join(', '));
    }

    log.info('XSRF token obtained, attempting login...');

    // Step 2: Login with email/password
    const loginRes = await axios.post(LOGIN_URL, {
      email,
      password,
      rememberMe: true
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': xsrfToken,
        'Cookie': cookieJar.join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.epicgames.com/id/login',
        'Origin': 'https://www.epicgames.com'
      },
      maxRedirects: 0,
      validateStatus: () => true
    });

    if (loginRes.status !== 200) {
      throw new Error(`Login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
    }

    log.info('Login successful, fetching exchange code...');

    // Step 3: Get exchange code
    const exchangeRes = await axios.get(EXCHANGE_URL, {
      headers: {
        'Accept': 'application/json',
        'X-XSRF-TOKEN': xsrfToken,
        'Cookie': cookieJar.join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.epicgames.com/id/login',
        'Origin': 'https://www.epicgames.com'
      },
      maxRedirects: 0,
      validateStatus: () => true
    });

    if (exchangeRes.status !== 200) {
      throw new Error(`Exchange code request failed with status ${exchangeRes.status}: ${JSON.stringify(exchangeRes.data)}`);
    }

    const exchangeCode = exchangeRes.data?.code;
    if (!exchangeCode) {
      throw new Error('No exchange code returned: ' + JSON.stringify(exchangeRes.data));
    }

    log.info('Exchange code received, fetching OAuth token...');

    // Step 4: Exchange code for OAuth token
    const tokenRes = await axios.post(EPIC_TOKEN, qs.stringify({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode
    }), {
      headers: {
        Authorization: getBasicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    log.info('OAuth token received successfully');
    return tokenRes.data;
  } catch (err) {
    const data = err?.response?.data;
    const errorCode = data?.errorCode || data?.message || err.message;
    log.error('Password login failed:', errorCode);
    if (data) log.error('Error details:', JSON.stringify(data));
    throw new Error(`Password login failed: ${errorCode}`);
  }
}

module.exports = { loginWithEmailPassword };
