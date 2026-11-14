import "dotenv/config";
const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
const list=v=>String(v||"").split(",").map(s=>s.trim()).filter(Boolean);

const DEFAULT_NAMES=["Vexor","Kairo","Zyph","Riven","Nyx","Drax","Soren","Kryo","Taz","Mako"];
const baseName=process.env.MC_USERNAME||"YazoniBot";
const botCount=Math.max(1,Math.min(20,Math.floor(num(process.env.BOTS,1))));

// BOTS=1 keeps the original single-bot behaviour (uses MC_USERNAME).
// BOTS>1 uses BOT_NAMES (comma separated) or the default name list, padding with <MC_USERNAME><n>.
function buildNames(){
  let wanted=list(process.env.BOT_NAMES);
  if(!wanted.length)wanted=botCount===1?[baseName]:DEFAULT_NAMES;
  const out=[];
  for(const n of wanted){const name=n.slice(0,16);if(!out.includes(name))out.push(name);}
  for(let i=1;out.length<botCount;i++){const name=(baseName+i).slice(0,16);if(!out.includes(name))out.push(name);}
  return out.slice(0,botCount);
}
export const botNames=buildNames();

export const config={
  host:process.env.MC_HOST||"localhost",port:num(process.env.MC_PORT,25565),
  username:botNames[0],auth:process.env.MC_AUTH||"offline",
  owner:process.env.OWNER_USERNAME||"Yazoni_plays",botName:botNames[0],
  model:process.env.GEMINI_MODEL||"gemini-3.5-flash-lite",
  fallbackModel:process.env.GEMINI_FALLBACK_MODEL||"gemini-3.1-flash-lite",
  apiKey:process.env.GEMINI_API_KEY||"",
  personality:process.env.BOT_PERSONALITY||"Funny, quick-witted Minecraft companion for videos. Be playful, occasionally sarcastic, react to chaos, but never become annoying or spammy.",
  memoryDb:"data/memory.db",reconnectMs:5000,viewDistance:10,
  thinkMs:Math.max(10000,num(process.env.THINK_INTERVAL_MS,20000)),proactiveChatMs:num(process.env.PROACTIVE_CHAT_MS,30000),maxPlanSteps:num(process.env.MAX_PLAN_STEPS,8),
  autoFollow:process.env.AUTO_FOLLOW!=="false",followDistance:num(process.env.FOLLOW_DISTANCE,5),
  // multi-bot
  joinDelayMs:Math.max(1000,num(process.env.JOIN_DELAY_MS,6000)),   // servers throttle fast reconnects
  geminiGapMs:Math.max(0,num(process.env.GEMINI_MIN_GAP_MS,4000)),  // shared spacing between Gemini calls
  maxQueue:Math.max(1,num(process.env.GEMINI_MAX_QUEUE,6))          // drop calls beyond this backlog
};
