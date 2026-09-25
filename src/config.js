import "dotenv/config";
const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
export const config={
  host:process.env.MC_HOST||"localhost",
  port:num(process.env.MC_PORT,25565),
  username:process.env.MC_USERNAME||"YazoniBot",
  auth:process.env.MC_AUTH||"offline",
  owner:process.env.OWNER_USERNAME||"Yazoni",
  botName:process.env.BOT_NAME||"YazoniBot",
  model:process.env.GEMINI_MODEL||"gemini-2.5-flash",
  apiKey:process.env.GEMINI_API_KEY||"",
  personality:process.env.BOT_PERSONALITY||"Natural, curious, loyal Minecraft companion. Speak briefly, act independently, and learn the owner's preferences.",
  memoryDb:"data/memory.db",
  reconnectMs:5000,
  viewDistance:10,
  thinkMs:num(process.env.THINK_INTERVAL_MS,12000),
  maxPlanSteps:num(process.env.MAX_PLAN_STEPS,8),
  safeDistance:num(process.env.SAFE_DISTANCE,18)
};