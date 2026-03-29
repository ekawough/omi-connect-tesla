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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function hasTeslaWakeWord(text) {
  return /\b(hey\s+)?tesla\b/i.test(text);
}

function stripWakeWord(text) {
  return text.replace(/\b(hey\s+|ok\s+|yo\s+)?tesla[,.]?\s*/i, '').trim();
}

const COMMANDS = {
  'unlock': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'unlock my car': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'unlock the car': { cmdoor_unlock', msg: '🔓 Unlocked.' },
  'unlock car': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'open up': { cmd: 'door_unlock', msg: '🔓 Unlocked.' },
  'lock': { cmd: 'door_lock', msg: cked.' },
  'lock up': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'lock the car': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'lock my car': { cmd: 'door_lock', msg: '🔒 Locked.' },
  'open trunk': { cmd: 'actuate', params: { which_trunk: 'rear' }, msg: '🧳 Trunk open.' },
  'open the trunk': { cmd: 'actuate_trunk', params: { which_trunk: 'rear' }, msg: '🧳 Trunk open.' },
  'pop the trunk': { cmd: 'actuate_trunk', params: { which_trunk: 'rear' }, msg: '🧳 Trunk popped.' },
  'open frunk'd: 'actuate_trunk', params: { which_trunk: 'front' }, msg: '📦 Frunk open.' },
  'pop the frunk': { cmd: 'actuate_trunk', params: { which_trunk: 'front' }, msg: '📦 Fruopped.' },
  'start climate': { cmd: 'auto_conditioning_start', msg: '❄️ Climate on.' },
  'turn on climate': { cmd: 'auto_conditioning_start', msg: '❄️ Climate on.' },
  'heat up': { cmd: 'auto_conditioning_start', msg: '🔥 Heating on.' },
  'warm up': { cmd: 'auto_conditioning_start' Warming up.' },
  'cool down': { cmd: 'auto_conditioning_start', msg: '❄️ Cooling on.' },
  'stop climate': { cmd: 'auto_conditioning_stop', msg: '⏹ Climate off.' },
  'turn off climate': { cmd: 'auto_conditioning_stop', msg: '⏹ Climate off.' },
  'start charging': { cmd: 'charge_start', msg: '⚡ Charging started.' },
  'charge it': { cmd: 'charge_start', msg: '⚡ Charging started.' },
  'stop charging': { cmd: 'charge_stop', msg: '⏹ Charging stopped.' },
  'open charge port':e_port_door_open', msg: '🔌 Charge port open.' },
  'close charge port': { cmd: 'charge_port_door_close', msg: '🔌 Charge port closed.' },
  'flash lights': { cmd: 'flash_lights', msg: '💡 Lights flashed.' },
  'find my car': { cmd: 'flash_lightg: '💡 Flashing to find your car.' },
  'honk': { cmd: 'honk_horn', msg: '📣 Honked.' },
  'honk horn': { cmd: 'honk_horn', msg: '📣 Honked.' },
};

function matchCommand(text) {
  const clean = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g.trim();
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `Tesla voice command detector. Respond ONLY with JSON.
If command detected: {"cmd":"COMMAND","params":{},"msg":"Short confirmation."}
If unclear: {"cmd":null}
Commands: door_unlock, door_lock, actuate_trunk (params: {"which_trunk":"rear"} or {"which_trunk":"front"}), auto_conditioning_start, auto_conditioning_stop, charge_start, charge_stop, charge_port_door_open, charge_port_door_close, flash_lights, honk_horn
Context: hands full/approaching=door_unlock, leaving=door_lock, loading bags=actuate_trunk rear, hot/cold=auto_conditioning_start, cant find car=flash_lights`,
      messages: [{ role: 'user', content: `"${text}"` }],
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

async function executeCommand(session, commandName, params = {}) {
  const { access_token, vin } = session;
  try {
    await axios.post(`${VCP_PROXY}/api/1/vehicles/${vin}/wake_up`, {}, {
      headers: { Authorization: `Bearer ${access_token}` }, timeout: 8000
    });
    await new Promise(r => setTimeout(r, 2500));
  } catch {}
  const res = await axios.post(
    `${VCP_PROXY}/api/1/vehicles/${vin}/command/${commandName}`,
    params,
    { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return res.data;
}

async function notify(uid, message) {
  if (!OMI_API_KEY) return;
  try {
    await axios.post('https://api.omi.me/v1/apps/notify',
      { uid, message },
      { headers: { Authorization: `Bearer ${OMI_API_KEY}`, 'Content-Type': 'application/json' } }
    );
  } catch {}
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
  const key = `${sessionId}:${cmd}`;
  const last = recentCmds.get(key);
  return last && Date.now() - last < 5000;
}
function markCmd(sessionId, cmd) {
  recentCmds.set(`${sessionId}:${cmd}`, Date.now());
}

app.post('/webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  const uid = req.query.uid;
  const sessionId = req.query.session_id || uid;
  const body = req.body;
  if (!uid) return;
  let segments = [];
  if (Array.isArray(body)) segments = body;
  else if (body?.transcript_segments) segments = body.transcript_segments;
  else if (body?.segments) segments = body.segments;
  if (!segments.length) return;
  if (isRateLimited(uid)) return;
  const fullText = segments.map(s => s.text || '').join(' ').trim();
  if (!fullText || fullText.length < 3) return;
  if (!hasTeslaWakeWord(fullText)) return;
  const commandText = stripWakeWord(fullText);
  if (!commandText) return;
  console.log(`[wake] uid=${uid} | "${fullText}"`);
  try {
    let commandName = null, commandParams = {}, confirmMsg = '';
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
    if (!session) { await notify(uid, '⚠️ Tesla not connected. Open Omi Connect to set up.'); return; }
    const result = await executeCommand(session, commandName, commandParams);
    console.log(`[succ uid=${uid} | ${commandName}`);
    await supabase.from('command_log').insert({ uid, command: commandName, trigger_text: fullText, success: true, created_at: new Date().toISOString() });
    await notify(uid, confirmMsg);
  } catch (err) {
    console.error(`[error] uid=${uid} | ${err.message}`);
  }
});

app.post('/session', async (req, res) => {
  const { uid, access_token, refresh_token, expires_in, vin, vehicle_name, secret } = req.body;
  if (secret !== INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const expires_at = new Date(Date.now() + (expires_in || 28800) * 1000).toISOString();
  const { error } = await supabase.from('tesla_sessions').upsert({
    uid, access_token, refresh_token, expires_at, vin,
    vehicle_name: vehicle_name || 'My Tesla', updated_at: new Date().toISOString()
  });
  if (error) return res.status(500).json({ error: 'Failed to store session' });
  console.log(`[session] uid=${uid} vin=${vin}`);
  res.json({ status: 'ok' });
});

app.get('/setup-check', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.json({ is_setup_completed: false });
  const session = await getSession(uid);
  res.json({ is_setup_completed: !!session });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), version: '2.0.0' });
});

app.listen(PORT, () => console.log(`Omi Connect Tesla running on :${PORT}`));
