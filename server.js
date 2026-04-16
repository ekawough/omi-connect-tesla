const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const OMI_API_KEY = process.env.OMI_API_KEY;
const VCP_PROXY = process.env.VCP_PROXY_URL || 'https://connect.omideveloper.com';
const APP_URL = process.env.APP_URL || 'https://omi-connect-tesla-production.up.railway.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Tesla Command Logic ──────────────────────────────────────────────────────

function hasTeslaWakeWord(text) {
  return /\b(hey\s+)?tesla\b/i.test(text);
}

function stripWakeWord(text) {
  return text.replace(/\b(hey\s+|ok\s+|yo\s+)?tesla[,.]?\s*/i, '').trim();
}

const COMMANDS = {
  'unlock': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'unlock my car': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'unlock the car': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'unlock car': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'open up': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'lock': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'lock up': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'lock the car': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'lock my car': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'open trunk': { cmd: 'actuate_trunk', params: { which_trunk: 'rear' }, msg: '🧳 Trunk open.' },
  'open the trunk': { cmd: 'actuate_trunk', params: { which_trunk: 'rear' }, msg: '🧳 Trunk open.' },
  'pop the trunk': { cmd: 'actuate_trunk', params: { which_trunk: 'rear' }, msg: '🧳 Trunk popped.' },
  'open frunk': { cmd: 'actuate_trunk', params: { which_trunk: 'front' }, msg: '📦 Frunk open.' },
  'pop the frunk': { cmd: 'actuate_trunk', params: { which_trunk: 'front' }, msg: '📦 Frunk popped.' },
  'start climate': { cmd: 'auto_conditioning_start', msg: '❄️ Climate on.' },
  'turn on climate': { cmd: 'auto_conditioning_start', msg: '❄️ Climate on.' },
  'heat up': { cmd: 'auto_conditioning_start', msg: '🔥 Heating on.' },
  'warm up': { cmd: 'auto_conditioning_start', msg: '🔥 Warming up.' },
  'cool down': { cmd: 'auto_conditioning_start', msg: '❄️ Cooling on.' },
  'stop climate': { cmd: 'auto_conditioning_stop', msg: '⏹ Climate off.' },
  'turn off climate': { cmd: 'auto_conditioning_stop', msg: '⏹ Climate off.' },
  'start charging': { cmd: 'charge_start', msg: '⚡ Charging started.' },
  'charge it': { cmd: 'charge_start', msg: '⚡ Charging started.' },
  'stop charging': { cmd: 'charge_stop', msg: '⏹ Charging stopped.' },
  'open charge port': { cmd: 'charge_port_door_open', msg: '🔌 Charge port open.' },
  'close charge port': { cmd: 'charge_port_door_close', msg: '🔌 Charge port closed.' },
  'flash lights': { cmd: 'flash_lights', msg: '💡 Lights flashed.' },
  'find my car': { cmd: 'flash_lights', msg: '💡 Flashing to find your car.' },
  'honk': { cmd: 'honk_horn', msg: '📣 Honked.' },
  'honk horn': { cmd: 'honk_horn', msg: '📣 Honked.' },
};

function matchCommand(text) {
  const clean = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (COMMANDS[clean]) return COMMANDS[clean];
  for (const [phrase, command] of Object.entries(COMMANDS)) {
    if (clean.includes(phrase)) return command;
  }
  return null;
}

async function detectIntent(text) {
  if (!ANTHROPIC_API_KEY) return null;
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      system: 'Tesla voice command detector. Respond ONLY with JSON.\nIf command detected: {"cmd":"COMMAND","params":{},"msg":"Short confirmation."}\nIf unclear: {"cmd":null}\nCommands: door_unlock, door_lock, actuate_trunk (params: {"which_trunk":"rear"} or {"which_trunk":"front"}), auto_conditioning_start, auto_conditioning_stop, charge_start, charge_stop, charge_port_door_open, charge_port_door_close, flash_lights, honk_horn\nContext: hands full/approaching=door_unlock, leaving=door_lock, loading bags=actuate_trunk rear, hot/cold=auto_conditioning_start, cant find car=flash_lights',
      messages: [{ role: 'user', content: '"' + text + '"' }],
    },
    { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
  );
  const result = JSON.parse(res.data.content[0].text.trim());
  if (!result.cmd) return null;
  return { cmd: result.cmd, params: result.params || {}, msg: result.msg || 'Done.' };
}

async function getSession(uid) {
  const { data, error } = await supabase.from('tesla_sessions').select('*').eq('uid', uid).single();
  if (error || !data) return null;
  return data;
}

async function executeCommand(session, commandName, params) {
  const { access_token, vin } = session;
  try {
    await axios.post(VCP_PROXY + '/api/1/vehicles/' + vin + '/wake_up', {}, {
      headers: { Authorization: 'Bearer ' + access_token }, timeout: 8000
    });
    await new Promise(r => setTimeout(r, 2500));
  } catch(e) {}
  const res = await axios.post(
    VCP_PROXY + '/api/1/vehicles/' + vin + '/command/' + commandName,
    params || {},
    { headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return res.data;
}

async function notify(uid, message) {
  if (!OMI_API_KEY) return;
  try {
    await axios.post('https://api.omi.me/v1/apps/notify',
      { uid, message },
      { headers: { Authorization: 'Bearer ' + OMI_API_KEY, 'Content-Type': 'application/json' } }
    );
  } catch(e) {}
}

const rateLimits = new Map();
function isRateLimited(uid) {
  const now = Date.now();
  const calls = (rateLimits.get(uid) || []).filter(t => now - t < 30000);
  calls.push(now);
  rateLimits.set(uid, calls);
  return calls.length > 20;
}

const recentCmds = new Map();
function isDuplicate(sessionId, cmd) {
  const key = sessionId + ':' + cmd;
  const last = recentCmds.get(key);
  return last && Date.now() - last < 5000;
}
function markCmd(sessionId, cmd) {
  recentCmds.set(sessionId + ':' + cmd, Date.now());
}

// ─── Frontend Pages ───────────────────────────────────────────────────────────

function renderPage({ title, body, uid = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Omi x Tesla</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f;
    --surface: #13131a;
    --border: #1e1e2e;
    --red: #e82127;
    --red-dim: #8a1015;
    --red-glow: rgba(232,33,39,0.15);
    --text: #f0f0f5;
    --muted: #6b6b80;
    --accent: #4f8ef7;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
  }
  .wordmark {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 40px;
    margin-top: 8px;
  }
  .wordmark svg { width: 28px; height: 28px; }
  .wordmark span { font-size: 18px; font-weight: 600; letter-spacing: -0.3px; color: var(--muted); }
  .wordmark strong { color: var(--text); }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px 24px;
    width: 100%;
    max-width: 420px;
    margin-bottom: 16px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 20px;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border-radius: 100px;
    font-size: 14px;
    font-weight: 500;
  }
  .status-pill.connected { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
  .status-pill.disconnected { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .btn {
    display: block;
    width: 100%;
    padding: 16px;
    border-radius: 14px;
    border: none;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    transition: opacity 0.15s, transform 0.1s;
    margin-top: 20px;
  }
  .btn:active { transform: scale(0.98); }
  .btn-red { background: var(--red); color: #fff; }
  .btn-red:hover { opacity: 0.9; }
  .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn-outline:hover { border-color: var(--muted); }
  .step {
    display: flex;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
    align-items: flex-start;
  }
  .step:last-child { border-bottom: none; padding-bottom: 0; }
  .step-num {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--red-glow);
    border: 1px solid var(--red-dim);
    color: var(--red);
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .step-label { font-size: 15px; font-weight: 500; }
  .step-sub { font-size: 13px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
  .cmd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }
  .cmd-chip {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13px;
    color: var(--muted);
  }
  .cmd-chip strong { display: block; color: var(--text); font-size: 12px; margin-bottom: 2px; font-weight: 500; }
  .uid-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 14px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: var(--accent);
    word-break: break-all;
    margin-top: 4px;
  }
  .divider { height: 1px; background: var(--border); margin: 8px 0; }
  .footnote { font-size: 12px; color: var(--muted); text-align: center; margin-top: 8px; line-height: 1.6; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="wordmark">
  <svg viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="8" fill="#e82127"/>
    <path d="M14 5L6 10.5V17.5L14 23L22 17.5V10.5L14 5Z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="14" cy="14" r="2.5" fill="white"/>
  </svg>
  <span><strong>Omi</strong> × Tesla</span>
</div>
${body}
</body>
</html>`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  const uid = req.query.uid || '';
  let connected = false;
  let vehicleName = '';

  if (uid) {
    const session = await getSession(uid);
    connected = !!session;
    vehicleName = session?.vehicle_name || 'My Tesla';
  }

  const statusPill = connected
    ? `<div class="status-pill connected"><div class="dot"></div>${vehicleName} Connected</div>`
    : `<div class="status-pill disconnected"><div class="dot"></div>Not Connected</div>`;

  const connectBtn = connected
    ? `<a href="/disconnect?uid=${uid}" class="btn btn-outline">Disconnect Tesla</a>`
    : `<a href="${VCP_PROXY}/auth/tesla?uid=${uid || 'YOUR_OMI_UID'}" class="btn btn-red">${uid ? 'Connect My Tesla' : 'Open in Omi App'}</a>`;

  const uidSection = uid
    ? `<div class="card">
        <div class="card-title">Your UID</div>
        <div class="uid-box">${uid}</div>
        <div class="footnote" style="margin-top:10px;">Webhook URL for Omi plugin settings:<br>
        <a href="${APP_URL}/webhook?uid=${uid}">${APP_URL}/webhook?uid=${uid}</a></div>
      </div>`
    : `<div class="card">
        <div class="card-title">Setup</div>
        <div class="step">
          <div class="step-num">1</div>
          <div><div class="step-label">Open in Omi App</div><div class="step-sub">Install the Omi Connect — Tesla plugin. Open Plugin Settings — it will pass your UID automatically.</div></div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div><div class="step-label">Connect Your Tesla</div><div class="step-sub">Tap Connect My Tesla and sign in with your Tesla account.</div></div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div><div class="step-label">Start Talking</div><div class="step-sub">Say "hey Tesla lock the car" or any command below while wearing Omi.</div></div>
        </div>
        ${connectBtn}
      </div>`;

  const body = `
    <div class="card">
      <div class="card-title">Connection Status</div>
      ${statusPill}
      ${uid ? connectBtn : ''}
    </div>

    ${uidSection}

    <div class="card">
      <div class="card-title">Voice Commands</div>
      <div class="cmd-grid">
        <div class="cmd-chip"><strong>🔓 Unlock</strong>"Hey Tesla unlock"</div>
        <div class="cmd-chip"><strong>🔒 Lock</strong>"Hey Tesla lock"</div>
        <div class="cmd-chip"><strong>🧳 Trunk</strong>"Hey Tesla open trunk"</div>
        <div class="cmd-chip"><strong>📦 Frunk</strong>"Hey Tesla open frunk"</div>
        <div class="cmd-chip"><strong>❄️ Climate</strong>"Hey Tesla cool down"</div>
        <div class="cmd-chip"><strong>⚡ Charge</strong>"Hey Tesla charge it"</div>
        <div class="cmd-chip"><strong>💡 Find Car</strong>"Hey Tesla find my car"</div>
        <div class="cmd-chip"><strong>📣 Honk</strong>"Hey Tesla honk"</div>
      </div>
    </div>

    <div class="footnote">Omi Connect — Tesla v2.0.0 · <a href="/health">Status</a></div>
  `;

  res.send(renderPage({ title: 'Connect', body, uid }));
});

app.get('/success', async (req, res) => {
  const uid = req.query.uid || '';
  const session = uid ? await getSession(uid) : null;
  const vehicleName = session?.vehicle_name || 'Your Tesla';

  const body = `
    <div class="card" style="text-align:center; padding: 40px 24px;">
      <div style="font-size: 56px; margin-bottom: 16px;">✅</div>
      <div style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">${vehicleName} Connected</div>
      <div style="color: var(--muted); font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
        You're all set. Put on your Omi and say<br>
        <strong style="color: var(--text);">"Hey Tesla lock the car"</strong>
      </div>
      <a href="/?uid=${uid}" class="btn btn-red">View Dashboard</a>
    </div>
    <div class="footnote">Commands work hands-free while wearing Omi.<br>No app, no tapping — just talk.</div>
  `;

  res.send(renderPage({ title: 'Connected!', body, uid }));
});

app.get('/disconnect', async (req, res) => {
  const uid = req.query.uid;
  if (uid) {
    await supabase.from('tesla_sessions').delete().eq('uid', uid);
    console.log('[disconnect] uid=' + uid);
  }
  res.redirect('/?uid=' + (uid || ''));
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  const uid = req.query.uid;
  const sessionId = req.query.session_id || uid;
  const body = req.body;
  if (!uid) return;
  let segments = [];
  if (Array.isArray(body)) segments = body;
  else if (body && body.transcript_segments) segments = body.transcript_segments;
  else if (body && body.segments) segments = body.segments;
  if (!segments.length) return;
  if (isRateLimited(uid)) return;
  const fullText = segments.map(function(s) { return s.text || ''; }).join(' ').trim();
  if (!fullText || fullText.length < 3) return;
  if (!hasTeslaWakeWord(fullText)) return;
  const commandText = stripWakeWord(fullText);
  if (!commandText) return;
  notify(uid, '⚡ On it...');
  console.log('[wake] uid=' + uid + ' | "' + fullText + '"');
  try {
    let commandName = null;
    let commandParams = {};
    let confirmMsg = '';
    const exact = matchCommand(commandText);
    if (exact) { commandName = exact.cmd; commandParams = exact.params || {}; confirmMsg = exact.msg; }
    if (!commandName) {
      const ai = await detectIntent(commandText);
      if (ai) { commandName = ai.cmd; commandParams = ai.params || {}; confirmMsg = ai.msg; }
    }
    if (!commandName) return;
    if (isDuplicate(sessionId, commandName)) return;
    markCmd(sessionId, commandName);
    const session = await getSession(uid);
    if (!session) { await notify(uid, 'Tesla not connected. Visit ' + APP_URL + '?uid=' + uid + ' to set up.'); return; }
    const result = await executeCommand(session, commandName, commandParams);
    console.log('[success] uid=' + uid + ' | ' + commandName);
    await supabase.from('command_log').insert({ uid: uid, command: commandName, trigger_text: fullText, success: true, created_at: new Date().toISOString() });
    await notify(uid, confirmMsg);
  } catch (err) {
    console.error('[error] uid=' + uid + ' | ' + err.message);
  }
});

app.post('/session', async (req, res) => {
  const body = req.body;
  if (body.secret !== INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const expires_at = new Date(Date.now() + (body.expires_in || 28800) * 1000).toISOString();
  const { error } = await supabase.from('tesla_sessions').upsert({
    uid: body.uid,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: expires_at,
    vin: body.vin,
    vehicle_name: body.vehicle_name || 'My Tesla',
    updated_at: new Date().toISOString()
  });
  if (error) return res.status(500).json({ error: 'Failed to store session' });
  console.log('[session] uid=' + body.uid + ' vin=' + body.vin);
  // Redirect to success page if it's a browser flow
  res.json({ status: 'ok' });
});

app.get('/setup-check', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.json({ is_setup_completed: false });
  const session = await getSession(uid);
  res.json({ is_setup_completed: !!session });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), version: '2.1.0' });
});

// ─── Keep-alive (wake all Tesla sessions every 10 min) ───────────────────────

setInterval(async function() {
  try {
    const { data } = await supabase.from('tesla_sessions').select('uid,access_token,vin');
    if (!data) return;
    for (const s of data) {
      try {
        await axios.post(VCP_PROXY + '/api/1/vehicles/' + s.vin + '/wake_up', {}, {
          headers: { Authorization: 'Bearer ' + s.access_token }, timeout: 8000
        });
      } catch(e) {}
    }
  } catch(e) {}
}, 600000);

app.listen(PORT, function() { console.log('Omi Connect Tesla v2.1.0 on :' + PORT); });
