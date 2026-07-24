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

  const xmppBadge = $('xmpp-badge');
  if (state.xmppStatus === 'blocked') {
    xmppBadge.textContent = 'No XMPP';
    xmppBadge.className = 'badge warn';
    xmppBadge.style.display = 'inline-block';
  } else if (state.xmppStatus === 'connected') {
    xmppBadge.textContent = 'XMPP';
    xmppBadge.className = 'badge online';
    xmppBadge.style.display = 'inline-block';
  } else {
    xmppBadge.style.display = 'none';
  }

  if (state.authenticated) {
    $('login-box').classList.add('hidden');
    $('account-info').classList.remove('hidden');
    $('account-name').textContent = state.displayName || state.accountId;
    $('account-id').textContent = state.accountId || 'N/A';
    if (state.hasRefreshToken) {
      $('refresh-token-section').classList.remove('hidden');
      api('/api/refresh-token').then(d => {
        if (d.refreshToken) $('refresh-token-value').value = d.refreshToken;
      }).catch(() => {});
    } else {
      $('refresh-token-section').classList.add('hidden');
    }
  } else {
    $('account-info').classList.add('hidden');
    $('login-box').classList.remove('hidden');
  }

  $('party-id').textContent = state.partyId || 'None';
  $('party-members').textContent = state.partyMembers?.length || 0;
  $('auto-accept').checked = state.autoAccept;
  $('current-skin').textContent = state.currentSkin || 'None';
  $('current-emote').textContent = state.currentEmote || 'None';

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

$('btn-get-code').onclick = async () => {
  try {
    const data = await api('/api/auth-url');
    window.open(data.url, '_blank');
  } catch (e) {
    console.error(e);
  }
};

$('btn-submit-code').onclick = async () => {
  const code = $('auth-code-input').value.trim();
  if (!code) return alert('Paste the code or URL from Epic first');
  $('btn-submit-code').disabled = true;
  $('btn-submit-code').textContent = 'Connecting...';
  try {
    const data = await api('/api/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    if (data.ok) {
      $('auth-code-input').value = '';
    }
  } catch (e) {
    alert('Login failed: ' + e.message);
  } finally {
    $('btn-submit-code').disabled = false;
    $('btn-submit-code').textContent = 'Connect';
  }
};

$('btn-copy-token').onclick = () => {
  const input = $('refresh-token-value');
  input.select();
  navigator.clipboard.writeText(input.value).catch(() => {});
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
