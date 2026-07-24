const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);

let state = {};

function $(id) { return document.getElementById(id); }

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'state') {
    state = msg.data;
    render();
  }
};

function render() {
  const badge = $('status-badge');
  if (state.online && state.authenticated) {
    badge.textContent = 'Online';
    badge.className = 'badge online';
  } else {
    badge.textContent = 'Offline';
    badge.className = 'badge offline';
  }

  if (state.authenticated) {
    $('login-box').classList.add('hidden');
    $('btn-login').classList.add('hidden');
    $('account-info').classList.remove('hidden');
    $('account-name').textContent = state.displayName || state.accountId;
    $('account-id').textContent = state.accountId || 'N/A';
  } else {
    $('account-info').classList.add('hidden');
    $('btn-login').classList.remove('hidden');
  }

  $('party-id').textContent = state.partyId || 'None';
  $('party-members').textContent = state.partyMembers?.length || 0;
  $('auto-accept').checked = state.autoAccept;
  $('current-skin').textContent = state.currentSkin || 'None';
  $('current-emote').textContent = state.currentEmote || 'None';

  if (state.deviceCode && !state.authenticated) {
    $('login-box').classList.remove('hidden');
    $('device-code').textContent = state.deviceCode;
    $('login-link').href = state.loginLink || state.deviceCodeUrl;
    $('login-link').textContent = state.deviceCodeUrl || 'epicgames.com/activate';
  }

  const logsEl = $('logs');
  logsEl.innerHTML = '';
  (state.logs || []).forEach((log) => {
    const div = document.createElement('div');
    div.className = `log-entry ${log.level}`;
    const time = new Date(log.time).toLocaleTimeString();
    div.textContent = `[${time}] ${log.message}`;
    logsEl.appendChild(div);
  });
  logsEl.scrollTop = logsEl.scrollHeight;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}`;
    alert(msg);
    throw new Error(msg);
  }
  return data;
}

$('btn-login-password').onclick = async () => {
  const email = $('email').value;
  const password = $('password').value;
  if (!email || !password) return alert('Enter email and password');
  $('btn-login-password').disabled = true;
  try {
    await api('/api/login-password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    $('password').value = '';
  } catch (e) {
    console.error(e);
  } finally {
    $('btn-login-password').disabled = false;
  }
};

$('btn-login').onclick = async () => {
  $('btn-login').disabled = true;
  try {
    const data = await api('/api/login');
    if (data.user_code) {
      $('login-box').classList.remove('hidden');
      $('device-code').textContent = data.user_code;
      $('login-link').href = data.login_link || data.verification_uri;
      $('login-link').textContent = data.verification_uri;
    }
  } catch (e) {
    console.error(e);
  } finally {
    $('btn-login').disabled = false;
  }
};

$('btn-disconnect').onclick = async () => {
  await api('/api/disconnect', { method: 'POST' });
  window.location.reload();
};

$('auto-accept').onchange = async (e) => {
  await api('/api/accept-invites', {
    method: 'POST',
    body: JSON.stringify({ enabled: e.target.checked })
  });
};

$('btn-send-msg').onclick = async () => {
  const text = $('party-msg').value;
  if (!text) return;
  await api('/api/message', { method: 'POST', body: JSON.stringify({ text }) });
  $('party-msg').value = '';
};

function equip(type, id, extra = {}) {
  if (!id) return alert('Enter an ID');
  api('/api/equip', {
    method: 'POST',
    body: JSON.stringify({ type, id, ...extra })
  });
}

$('btn-equip-skin').onclick = () => equip('skin', $('skin-id').value);
$('btn-equip-backpack').onclick = () => equip('backpack', $('backpack-id').value);
$('btn-equip-pickaxe').onclick = () => equip('pickaxe', $('pickaxe-id').value);
$('btn-play-emote').onclick = () => equip('emote', $('emote-id').value, { section: $('emote-section').value });

// initial load
api('/api/status').then((s) => { state = s; render(); });
