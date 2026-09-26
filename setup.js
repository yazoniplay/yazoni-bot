import fs from "node:fs";
import path from "node:path";
import {execFileSync,spawn} from "node:child_process";
import net from "node:net";
import http from "node:http";

const root=path.resolve(".mindcraft");
const repoUrl="https://github.com/mindcraft-bots/mindcraft.git";
const ref="v0.1.4";
const mineflayerVersion=process.env.MINEFLAYER_VERSION||"4.39.0";

function run(cmd,args,cwd=process.cwd()){
  console.log("[YazoniBot]",cmd,args.join(" "));
  execFileSync(cmd,args,{cwd,stdio:"inherit",env:process.env});
}

if(!fs.existsSync(path.join(root,"main.js"))){
  if(fs.existsSync(root)) fs.rmSync(root,{recursive:true,force:true});
  run("git",["clone","--depth","1","--branch",ref,repoUrl,root]);
}

const pkgPath=path.join(root,"package.json");
const pkg=JSON.parse(fs.readFileSync(pkgPath,"utf8"));
pkg.dependencies={...(pkg.dependencies||{}),mineflayer:mineflayerVersion};
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+"\n");

const stalePatches=[
  "mineflayer+4.33.0.patch",
  "minecraft-data+3.97.0.patch"
];
for(const patch of stalePatches){
  const patchPath=path.join(root,"patches",patch);
  if(fs.existsSync(patchPath)){
    fs.rmSync(patchPath,{force:true});
    console.log("[YazoniBot] Removed incompatible Mindcraft patch:",patch);
  }
}
run("npm",["install","--no-audit","--no-fund","--include=dev"],root);

// Patch Mindcraft player navigation so missing/offline players never crash an action.
// Mindcraft v0.1.4 assumes bot.players[username] always exists; Mineflayer does not.
// A player entry can be absent while the player is offline/not loaded.
const skillsPath=path.join(root,"src","agent","library","skills.js");
if(fs.existsSync(skillsPath)){
  let skills=fs.readFileSync(skillsPath,"utf8");
  skills=skills.replace(
    '    let player = bot.players[username].entity\n',
    '    const playerEntry = bot.players?.[username];\n    let player = playerEntry?.entity;\n'
  );
  skills=skills.replace(
    '    let player = bot.players[username].entity\n    if (!player)\n        return false;\n',
    '    const playerEntry = bot.players?.[username];\n    let player = playerEntry?.entity;\n    if (!player) {\n        log(bot, \`Could not find \${username}. The player may be offline or not currently loaded.\`);\n        return false;\n    }\n'
  );
  fs.writeFileSync(skillsPath,skills);
  console.log("[YazoniBot] Patched safe player lookup in Mindcraft skills.");
}

// Patch Mindcraft chat routing and deterministic owner commands.
const agentSourcePath=path.join(root,"src","agent","agent.js");
if(fs.existsSync(agentSourcePath)){
  let agentSource=fs.readFileSync(agentSourcePath,"utf8");
  const oldChat = "        if (settings.only_chat_with.length > 0) {\n            for (let username of settings.only_chat_with) {\n                this.bot.whisper(username, message);\n            }\n        }\n        else {\n            if (settings.speak) {\n                speak(to_translate, this.prompter.profile.speak_model);\n            }\n            if (settings.chat_ingame) {this.bot.chat(message);}\n            sendOutputToServer(this.name, message);\n        }";
  const newChat = "        if (settings.speak) { speak(to_translate, this.prompter.profile.speak_model); }\n        if (settings.chat_ingame) { this.bot.chat(message); }\n        sendOutputToServer(this.name, message);";
  agentSource=agentSource.replace(oldChat,newChat);
  const needle="        // Now translate the message\n";
  const injected="        // Deterministic owner command: \"mine up\" always mines blocks above the bot.\n        if (!self_prompt && !from_other_bot && settings.only_chat_with.includes(source) && /\\bmine\\s+up\\b/i.test(message)) {\n            try {\n                const base=this.bot.blockAt(this.bot.entity.position);\n                let mined=0;\n                for(let n=1;n<=4;n++){\n                    const block=this.bot.blockAt(base.position.offset(0,n,0));\n                    if(!block || [\"air\",\"cave_air\",\"void_air\"].includes(block.name)) break;\n                    await this.bot.dig(block,true);\n                    mined++;\n                }\n                this.routeResponse(source, mined>0 ? \"Mining up — cleared \"+mined+\" block\"+(mined===1?\"\":\"s\")+\" above me.\" : \"There is nothing to mine above me.\");\n                return true;\n            } catch(error) {\n                console.error(\"[YazoniBot] mine up failed:\",error);\n                this.routeResponse(source,\"I tried to mine up, but the block could not be broken.\");\n                return false;\n            }\n        }\n\n";
  if(!agentSource.includes("Deterministic owner command: \"mine up\"")) agentSource=agentSource.replace(needle,injected+needle);
  // Start a lightweight autonomous content loop. Mindcraft's self-prompter is otherwise STOPPED by default,\n  // so the bot only acts when spoken to. We deliberately run one LLM decision at a time to avoid\n  // burning Gemini quota while still giving the character independent behavior for videos.\n  const autoNeedle='                this.startEvents();\\n';\n  const autoInject=\`                this.startEvents();\n                this.__yazoniAutonomyStarted = true;\n                let __yazoniAutoBusy = false;\n                const __yazoniAutonomousThink = async () => {\n                    if (__yazoniAutoBusy || !this.bot || !this.bot.entity || this.actions?.executing) return;\n                    __yazoniAutoBusy = true;\n                    try {\n                        await this.handleMessage('system',\n                            'You are the autonomous content brain for a Minecraft YouTube companion. Act independently; do not wait for the owner.\\n' +\n                            'Look at the current world/inventory/context and choose ONE useful, funny, or interesting thing to do now.\\n' +\n                            'Examples: explore somewhere new, gather resources, chop a tree, improve the area, farm, craft something useful, investigate a structure, react to nearby mobs/events, or create a small funny moment.\\n' +\n                            'Do not repeatedly follow the owner unless that is genuinely the best action. Do not stand still. Prefer real Minecraft actions over talking.\\n' +\n                            'Choose an action that can actually be executed with the available commands, then do it.', 1);\n                    } catch (error) {\n                        console.error('[YazoniBot] autonomous decision failed:', error);\n                    } finally {\n                        __yazoniAutoBusy = false;\n                    }\n                };\n                setTimeout(__yazoniAutonomousThink, 15000);\n                setInterval(__yazoniAutonomousThink, Number(process.env.AUTONOMY_INTERVAL_MS || 45000));\n\`;\n                agentSource=agentSource.replace(autoNeedle,autoInject);\n  fs.writeFileSync(agentSourcePath,agentSource);
  console.log("[YazoniBot] Patched public chat routing and deterministic mine-up command.");
}
const presenceModule = `import pf from "mineflayer-pathfinder";

const { Movements, goals } = pf;

export function installPresence(agent) {
  const originalStart = agent.start.bind(agent);

  agent.start = async (...args) => {
    await originalStart(...args);

    const bot = agent.bot;
    if (!bot) return;

    const begin = () => {
      if (bot.__yazoniPresenceStarted) return;
      bot.__yazoniPresenceStarted = true;

      const movements = new Movements(bot);
      movements.canDig = false;
      movements.canPlace = false;
      movements.allow1by1towers = false;
      movements.allowParkour = false;
      bot.pathfinder.setMovements(movements);

      let busy = false;

      const wander = async () => {
        if (busy || !bot.entity || !bot.pathfinder) return;
        if (agent.actions?.executing) return;

        busy = true;
        try {
          const y = Math.floor(bot.entity.position.y);
          const blocks = bot.findBlocks({
            matching: block =>
              block &&
              block.boundingBox === "block" &&
              Math.abs(block.position.y - y) <= 2,
            maxDistance: 14,
            count: 40
          });

          if (blocks.length > 0) {
            const target = blocks[Math.floor(Math.random() * blocks.length)];
            const goal = new goals.GoalNear(target.x, target.y + 1, target.z, 2);
            await bot.pathfinder.goto(goal);
          }

          if (bot.entity) {
            const p = bot.entity.position;
            const angle = Math.random() * Math.PI * 2;
            const look = p.offset(Math.cos(angle) * 5, 1 + Math.random() * 2, Math.sin(angle) * 5);
            await bot.lookAt(look, true).catch(() => {});
          }

          if (Math.random() < 0.25 && bot.entity) {
            bot.setControlState("jump", true);
            setTimeout(() => bot.setControlState("jump", false), 180);
          }
        } catch (_) {
          // Wandering is cosmetic; never let it kill the AI agent.
        } finally {
          busy = false;
        }
      };

      wander();
      const timer = setInterval(wander, 9000);

      const cleanup = () => {
        clearInterval(timer);
        bot.clearControlStates();
      };

      bot.once("end", cleanup);
      bot.once("kicked", cleanup);
    };

    bot.once("spawn", begin);
  };
}
`;
fs.writeFileSync(path.join(root,"src","yazoni_presence.js"),presenceModule);

const initAgentPath=path.join(root,"src","process","init_agent.js");
const initAgentSource=`import { Agent } from "../agent/agent.js";
import { serverProxy } from "../agent/mindserver_proxy.js";
import { installPresence } from "../yazoni_presence.js";

const argv = process.argv.slice(2);
const value = (short, long) => {
  const i = argv.findIndex(x => x === short || x === long);
  return i >= 0 ? argv[i + 1] : undefined;
};

const name = value("-n", "--name") || argv[0];
const port = Number(value("-p", "--port") || 8080);
const loadMemory = argv.includes("-l") || argv.includes("--load_memory");
const initMessage = value("-m", "--init_message") || null;
const countId = Number(value("-c", "--count_id") || 0);

(async () => {
  try {
    console.log("Connecting to MindServer");
    await serverProxy.connect(name, port);
    console.log("Starting agent");
    const agent = new Agent();
    serverProxy.setAgent(agent);
    installPresence(agent);
    await agent.start(loadMemory, initMessage, countId);
  } catch (error) {
    console.error("Failed to start agent process:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
`;
fs.writeFileSync(initAgentPath,initAgentSource);

fs.mkdirSync(path.join(root,"profiles"),{recursive:true});
const profile={
  name:process.env.BOT_NAME||"YazoniBot",
  model:process.env.GEMINI_MODEL||"gemini-3.5-flash-lite",
  cooldown:Number(process.env.AI_COOLDOWN_MS||5000),
  speak_model:process.env.GEMINI_TTS_MODEL||"google/gemini-2.5-flash-preview-tts/Kore"
};
fs.writeFileSync(path.join(root,"profiles","yazoni.json"),JSON.stringify(profile,null,2));
fs.writeFileSync(path.join(root,"keys.json"),JSON.stringify({
  GEMINI_API_KEY:process.env.GEMINI_API_KEY||""
},null,2));

const settings={
  minecraft_version:process.env.MC_VERSION||"auto",
  host:process.env.MC_HOST||"localhost",
  port:Number(process.env.MC_PORT||25565),
  auth:process.env.MC_AUTH||"offline",
  mindserver_port:Number(process.env.MINDSERVER_PORT||8080),
  auto_open_ui:false,
  base_profile:"assistant",
  profiles:["./profiles/yazoni.json"],
  load_memory:true,
  init_message:`You are YazoniBot, a funny Minecraft companion made for YouTube videos. The owner exact Minecraft username is "${process.env.OWNER_USERNAME||"Yazoni_plays"}". Follow explicit owner instructions immediately. When the owner says "mine up", mine blocks above you; never interpret it as digging down. Use Minecraft actions instead of merely explaining what you would do.`,
  only_chat_with:process.env.OWNER_USERNAME?[process.env.OWNER_USERNAME]:[],
  speak:process.env.SPEAK==="true",
  chat_ingame:true,
  language:"en",
  render_bot_view:false,
  allow_insecure_coding:false,
  allow_vision:false,
  blocked_actions:[],
  relevant_docs_count:5,
  max_messages:Number(process.env.MAX_MESSAGES||15),
  num_examples:2,
  max_commands:-1,
  show_command_syntax:"shortened",
  narrate_behavior:true,
  chat_bot_messages:true,
  spawn_timeout:30,
  block_place_delay:0,
  log_all_prompts:false
};

process.env.SETTINGS_JSON=JSON.stringify(settings);
process.env.PROFILES=JSON.stringify(["./profiles/yazoni.json"]);

if(process.argv.includes("--start")){
  const healthPort=Number(process.env.PORT||process.env.HEALTH_PORT||3000);
  http.createServer((req,res)=>{
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({
      ok:true,
      service:"yazoni-bot",
      minecraft:{host:settings.host,port:settings.port},
      status:"running"
    }));
  }).listen(healthPort,"0.0.0.0",()=>console.log("[YazoniBot] Health server listening on",healthPort));

  const waitForMinecraft=()=>new Promise(resolve=>{
    const socket=net.createConnection({host:settings.host,port:settings.port});
    const finish=(status)=>{
      socket.destroy();
      resolve(status);
    };
    socket.setTimeout(5000);
    socket.once("connect",()=>finish(true));
    socket.once("timeout",()=>finish(false));
    socket.once("error",()=>finish(false));
  });

  const launch=async()=>{
    while(true){
      const reachable=await waitForMinecraft();
      if(!reachable){
        console.log("[YazoniBot] Minecraft server is not accepting connections at",settings.host+":"+settings.port,"— retrying in 15s");
        await new Promise(r=>setTimeout(r,15000));
        continue;
      }

      console.log("[YazoniBot] Minecraft endpoint is reachable. Starting Mindcraft agent...");
      const child=spawn(process.execPath,["main.js"],{
        cwd:root,
        stdio:"inherit",
        env:process.env
      });

      const code=await new Promise(resolve=>child.on("exit",resolve));
      console.log("[YazoniBot] Mindcraft exited with code",code,"— restarting in 10s");
      await new Promise(r=>setTimeout(r,10000));
    }
  };

  launch().catch(err=>{
    console.error("[YazoniBot] Supervisor error:",err);
    process.exit(1);
  });
}