// Mineflayer teammates: follow you, look at you, chat + decide with Gemini.
// Run:  npm install  &&  GEMINI_API_KEY=... OWNER=YourName node bot.js
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// ---------- config ----------
const HOST = process.env.MC_HOST || 'localhost';
const PORT = parseInt(process.env.MC_PORT || '25565');
const VERSION = process.env.MC_VERSION || false;        // false = auto-detect
const OWNER = process.env.OWNER || 'YourName';          // your Minecraft username
const COUNT = parseInt(process.env.BOTS || '3');
const API_KEY = process.env.GEMINI_API_KEY;             // keep this OUT of the code
// If this model name 404s, copy a current Flash-Lite model ID from Google AI Studio.
const MODEL = process.env.MODEL || 'gemini-flash-lite-latest';
const MIN_GAP_MS = parseInt(process.env.MIN_GAP_MS || '4000'); // global spacing between API calls
const NAMES = ['Vexor', 'Kairo', 'Zyph', 'Riven', 'Nyx', 'Drax', 'Soren', 'Kryo', 'Taz', 'Mako'];
const JOIN_DELAY_MS = 5000; // servers throttle fast reconnects

// ---------- LLM (Gemini) ----------
let lastCall = 0;
async function think(botName, history, playerMsg, speaker) {
  if (!API_KEY) return { say: `(${botName}) heard you, ${speaker}.`, action: 'none' };

  // global rate limit so the free tier doesn't 429 constantly
  const now = Date.now();
  if (now - lastCall < MIN_GAP_MS) return { say: '', action: 'none' };
  lastCall = now;

  history.push({ role: 'user', parts: [{ text: `${speaker}: ${playerMsg}` }] });
  while (history.length > 12) history.shift();

  const system =
    `You are ${botName}, a teammate in a Minecraft civilization series. Stay in character, ` +
    `be brief (under 100 characters). Reply ONLY with JSON: ` +
    `{"say":"<chat message or empty>","action":"follow|stay|none"}. ` +
    `Use "follow" if asked to come/follow, "stay" if asked to wait/stay, else "none".`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history,
          generationConfig: { maxOutputTokens: 200, responseMimeType: 'application/json' },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    history.push({ role: 'model', parts: [{ text }] });
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return { say: String(parsed.say || ''), action: parsed.action || 'none' };
  } catch (e) {
    console.error(`[${botName}] LLM error:`, e.message);
    history.pop();
    return { say: '', action: 'none' };
  }
}

// ---------- bot ----------
function makeBot(name, index) {
  const bot = mineflayer.createBot({ host: HOST, port: PORT, username: name, version: VERSION });
  bot.loadPlugin(pathfinder);
  const history = [];
  let mode = 'follow';

  const ownerEntity = () => bot.players[OWNER]?.entity;

  function applyMode() {
    const target = ownerEntity();
    if (mode === 'follow' && target) bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
    else bot.pathfinder.setGoal(null);
  }

  bot.once('spawn', () => {
    bot.pathfinder.setMovements(new Movements(bot));
    console.log(`[${name}] joined`);
    setInterval(() => {                       // look at owner, re-apply follow goal
      const t = ownerEntity();
      if (t) {
        bot.lookAt(t.position.offset(0, t.height, 0), true);
        if (mode === 'follow' && !bot.pathfinder.goal) applyMode();
      }
    }, 100);
    applyMode();
  });

  bot.on('chat', async (username, message) => {
    if (NAMES.includes(username)) return;     // ignore other bots
    const lower = message.toLowerCase();
    const byName = lower.includes(name.toLowerCase());
    // "everyone"/"team": only the first bot answers (saves API calls), but all obey
    const group = lower.includes('everyone') || lower.includes('team');
    if (!byName && !group) return;

    if (group && !byName) {
      if (/\b(stay|wait)\b/.test(lower)) mode = 'stay';
      else if (/\b(follow|come)\b/.test(lower)) mode = 'follow';
      applyMode();
      if (index !== 0) return;                // only bot #0 talks for the group
    }

    const { say, action } = await think(name, history, message, username);
    if (action === 'follow' || action === 'stay') { mode = action; applyMode(); }
    if (say) bot.chat(say.slice(0, 200));
  });

  bot.on('kicked', (r) => console.log(`[${name}] kicked:`, r));
  bot.on('error', (e) => console.log(`[${name}] error:`, e.message));
  bot.on('end', () => {                       // auto-reconnect
    console.log(`[${name}] disconnected, rejoining in 10s`);
    setTimeout(() => makeBot(name, index), 10000);
  });
  return bot;
}

NAMES.slice(0, COUNT).forEach((n, i) => setTimeout(() => makeBot(n, i), i * JOIN_DELAY_MS));
