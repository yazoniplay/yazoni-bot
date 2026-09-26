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

  // Make player lookup safe.
  skills=skills.replace(
    '    let player = bot.players[username].entity\n',
    '    const playerEntry = bot.players?.[username];\n    let player = playerEntry?.entity;\n'
  );

  // Replace Mindcraft's fragile follow implementation with a resilient controller.
  const followStart=skills.indexOf("export async function followPlayer(bot, username, distance=4) {");
  const followEnd=skills.indexOf("\n\nexport async function moveAway(",followStart);
  if(followStart!==-1 && followEnd!==-1){
    const robustFollow=`export async function followPlayer(bot, username, distance=4) {
    const playerEntry=bot.players?.[username];
    const player=playerEntry?.entity;
    if(!player){
        log(bot, \`I cannot see \${username} right now.\`);
        return false;
    }

    const move=new pf.Movements(bot);
    move.canDig=true;
    move.canPlace=true;
    move.allowParkour=true;
    move.allowSprinting=true;
    move.digCost=1;
    bot.pathfinder.setMovements(move);
    bot.modes.pause('unstuck');
    bot.modes.pause('elbow_room');

    log(bot, \`Actively following \${username}.\`);

    try{
        while(!bot.interrupt_code && bot.entity && player.isValid!==false){
            const d=bot.entity.position.distanceTo(player.position);

            if(d>4){
                try{
                    bot.pathfinder.setGoal(new pf.goals.GoalNear(
                        player.position.x,player.position.y,player.position.z,
                        Math.max(1.5,distance)
                    ));
                }catch(_){}

                if(d<14){
                    try{
                        await bot.lookAt(player.position.offset(0,1.5,0),true);
                        bot.setControlState('forward',true);
                        bot.setControlState('sprint',d>7);
                        if(player.position.y-bot.entity.position.y>0.45 || d>9){
                            bot.setControlState('jump',true);
                        }
                    }catch(_){}
                }
            }else{
                bot.setControlState('forward',false);
                bot.setControlState('sprint',false);
                bot.setControlState('jump',false);
                if(bot.pathfinder?.isMoving()) bot.pathfinder.setGoal(null);
            }

            await new Promise(resolve=>setTimeout(resolve,250));
        }
    }finally{
        bot.clearControlStates();
        try{bot.pathfinder.setGoal(null);}catch(_){}
        bot.modes.unpause('unstuck');
        bot.modes.unpause('elbow_room');
    }
    return true;
}
`;
    skills=skills.slice(0,followStart)+robustFollow+skills.slice(followEnd);
  }

  fs.writeFileSync(skillsPath,skills);
  console.log("[YazoniBot] Installed safe navigation and resilient follow skill.");
}

// Patch Mindcraft chat routing, deterministic owner commands, and autonomous content behavior.
const agentSourcePath=path.join(root,"src","agent","agent.js");
if(fs.existsSync(agentSourcePath)){
  let agentSource=fs.readFileSync(agentSourcePath,"utf8");

  const openStart=agentSource.indexOf("    async openChat(message) {");
  const openEnd=agentSource.indexOf("    startEvents() {",openStart);
  if(openStart !== -1 && openEnd !== -1){
    const publicOpenChat=`    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) {
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        message = message.replaceAll('\\n', ' ');
        if (settings.speak) speak(to_translate, this.prompter.profile.speak_model);
        if (settings.chat_ingame) this.bot.chat(message);
        sendOutputToServer(this.name, message);
    }

`;
    agentSource=agentSource.slice(0,openStart)+publicOpenChat+agentSource.slice(openEnd);
  }

  const translateNeedle="        // Now translate the message\\n";
  const deterministicMine=`        if (!self_prompt && !from_other_bot && settings.only_chat_with.some(u => String(u).toLowerCase() === String(source).toLowerCase()) && /\\bmine\\s+up\\b/i.test(String(message))) {
            try {
                let mined=0;
                for(let n=1;n<=8;n++){
                    const block=this.bot.blockAt(this.bot.entity.position.offset(0,n,0));
                    if(!block || ["air","cave_air","void_air"].includes(block.name)) break;
                    await this.bot.dig(block,true);
                    mined++;
                }
                await this.routeResponse(source, mined>0
                    ? "Mining up — cleared "+mined+" block"+(mined===1?"":"s")+" above me."
                    : "There is nothing solid above me.");
                return true;
            } catch(error) {
                console.error("[YazoniBot] deterministic mine-up failed:",error);
                await this.routeResponse(source,"I tried to mine up, but the block could not be broken.");
                return false;
            }
        }

`;
  if(!agentSource.includes("deterministic mine-up failed")){
    agentSource=agentSource.replace(translateNeedle,deterministicMine+translateNeedle);
  }

  const autoNeedle="                this.startEvents();\\n";
  const autoInject=`                this.startEvents();
                this.__yazoniAutonomyStarted=true;
                let __yazoniAutoBusy=false;
                let __yazoniAutoCalls=0;
                let __yazoniAutoDay=new Date().toISOString().slice(0,10);
                const __yazoniAutonomousThink=async()=>{
                    if(__yazoniAutoBusy || !this.bot || !this.bot.entity || !this.isIdle()) return;
                    __yazoniAutoBusy=true;
                    try{
                        await this.handleMessage('system',
                            'You are YazoniBot, an autonomous Minecraft YouTube character.\\n'+
                            'You must ACT in the world, not just talk. Pick ONE concrete action and execute it.\\n'+
                            'Do not use followPlayer or goToPlayer unless the owner explicitly asked you to follow or move to them.\\n'+
                            'Do not repeatedly choose the same action. Prefer varied content: mine useful resources, chop trees, gather food, craft useful items, explore, investigate structures, improve a base/area, farm, fight nearby hostile mobs when safe, react to events, or create a funny situation.\\n'+
                            'Never invent that you performed an action: actually call a Minecraft action command.\\n'+
                            'If an action fails, immediately choose a different executable action instead of explaining the failure.',1);
                    }catch(error){
                        console.error("[YazoniBot] autonomous decision failed:",error);
                    }finally{
                        __yazoniAutoBusy=false;
                    }
                };
                const __yazoniRunAutonomous=async()=>{
                    const today=new Date().toISOString().slice(0,10);
                    if(today!==__yazoniAutoDay){__yazoniAutoDay=today;__yazoniAutoCalls=0;}
                    if(__yazoniAutoCalls>=Number(process.env.MAX_AUTONOMY_CALLS_PER_DAY||500)) return;
                    if(!this.bot || !this.bot.entity || !this.isIdle()) return;
                    __yazoniAutoCalls++;
                    await __yazoniAutonomousThink();
                };
                setTimeout(__yazoniRunAutonomous,15000);
                setInterval(__yazoniRunAutonomous,Number(process.env.AUTONOMY_INTERVAL_MS||60000));
`;
  agentSource=agentSource.replace(autoNeedle,autoInject);

  fs.writeFileSync(agentSourcePath,agentSource);
  console.log("[YazoniBot] Installed public chat, deterministic owner commands, and autonomous content brain.");
}
const presenceModule = `import pf from "mineflayer-pathfinder";

export function installPresence(agent) {
  const originalStart = agent.start.bind(agent);

  agent.start = async (...args) => {
    await originalStart(...args);
    const bot = agent.bot;
    if (!bot) return;

    const begin = () => {
      if (bot.__yazoniPresenceStarted) return;
      bot.__yazoniPresenceStarted = true;

      const movements = new pf.Movements(bot);
      movements.canDig = true;
      movements.canPlace = true;
      movements.allowParkour = true;
      movements.allowSprinting = true;
      movements.allow1by1towers = false;
      movements.digCost = 1;
      bot.pathfinder.setMovements(movements);

      // Work around a known 1.21+ Mineflayer physics symptom where the bot
      // can lose the ability to jump. This is harmless when the server denies it.
      if (process.env.AUTO_PHYSICS_FIX !== "false") {
        try {
          bot.chat("/attribute @s minecraft:scale base set 0.9");
        } catch (_) {}
      }

      const cleanup = () => {
        bot.clearControlStates();
        try { bot.pathfinder.setGoal(null); } catch (_) {}
      };

      bot.once("end", cleanup);
      bot.once("kicked", cleanup);
    };

    if (bot.entity) begin();
    else bot.once("spawn", begin);
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