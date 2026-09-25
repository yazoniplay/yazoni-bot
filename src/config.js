import "dotenv/config";
const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
export const config={
  host:process.env.MC_HOST||"localhost",port:num(process.env.MC_PORT,25565),
  username:process.env.MC_USERNAME||"YazoniBot",auth:process.env.MC_AUTH||"offline",
  owner:process.env.OWNER_USERNAME||"Yazoni",botName:process.env.BOT_NAME||"YazoniBot",
  model:process.env.GEMINI_MODEL||"gemini-3.5-flash-lite",
  fallbackModel:process.env.GEMINI_FALLBACK_MODEL||"gemini-2.5-flash-lite",
  apiKey:process.env.GEMINI_API_KEY||"",
  personality:process.env.BOT_PERSONALITY||"Funny, quick-witted Minecraft companion for videos. Be playful, occasionally sarcastic, react to chaos, but never become annoying or spammy.",
  memoryDb:"data/memory.db",reconnectMs:5000,viewDistance:10,
  thinkMs:num(process.env.THINK_INTERVAL_MS,8000),proactiveChatMs:num(process.env.PROACTIVE_CHAT_MS,30000),maxPlanSteps:num(process.env.MAX_PLAN_STEPS,8),
  autoFollow:process.env.AUTO_FOLLOW!=="false",followDistance:num(process.env.FOLLOW_DISTANCE,5)
};