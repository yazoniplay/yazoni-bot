import http from "node:http";
import mineflayer from "mineflayer";
import {config} from "./config.js";
import {Memory} from "./memory.js";
import {Brain} from "./ai.js";
import {GameController} from "./game.js";
import {BehaviorLoop} from "./behavior.js";
const memory=new Memory(config.memoryDb);let bot=null,game=null,brain=null,behavior=null,reconnectTimer=null;
const renderPort=Number(process.env.PORT)||10000;
http.createServer((req,res)=>{res.writeHead(200,{"content-type":"text/plain"});res.end("YazoniBot online");}).listen(renderPort,"0.0.0.0",()=>console.log("[YazoniBot] Render health port listening on "+renderPort));
function makeBot(){
  console.log("[YazoniBot] Connecting to "+config.host+":"+config.port+" as "+config.username);
  bot=mineflayer.createBot({host:config.host,port:config.port,username:config.username,auth:config.auth,viewDistance:config.viewDistance});
  brain=new Brain(config,memory);game=new GameController(bot,memory,config);behavior=new BehaviorLoop(game,brain,config);
  bot.once("spawn",async()=>{game.ready();game.setHome();await game.equipArmor();behavior.start();console.log("[YazoniBot] Autonomous mode active.");bot.chat("I am here.");});
  bot.on("chat",async(username,message)=>{
    if(username===bot.username)return;
    memory.remember(username,"chat",message,username===config.owner?4:1);
    if(username===config.owner) await behavior.onOwnerMessage(message);
    else await behavior.onPlayerMessage(username,message);
  });

  // Server-console messages sent with /say are exposed to Mineflayer as system chat.
  // Handle common server-console prefixes without confusing ordinary player chat.
  bot.on("messagestr",async(message)=>{
    const text=String(message||"").trim();
    const consoleMatch=text.match(/^(?:\\[?Server\\]?|\\[?Console\\]?|Server|Console|SERVER)\\s*[:>]?\\s*(.+)$/i);
    if(consoleMatch){
      console.log("[YazoniBot] Server console message:",consoleMatch[1]);
      await behavior.onConsoleMessage(consoleMatch[1]);
    }
  });

  bot.on("systemChat",async(packet)=>{
    const text=typeof packet==="string"?packet:String(packet?.formattedText||packet?.text||"").trim();
    const match=text.match(/^(?:\\[?Server\\]?|\\[?Console\\]?|Server|Console|SERVER)\\s*[:>]?\\s*(.+)$/i);
    if(match){
      console.log("[YazoniBot] System console message:",match[1]);
      await behavior.onConsoleMessage(match[1]);
    }
  });

  // Also accept stdin when the runtime provides a real process console.
  // This works locally and in hosts that expose service stdin; Render can use /say
  // on the Minecraft server for the same behavior.
  if(process.stdin?.isTTY || process.env.ENABLE_STDIN_CONSOLE==="true"){
    process.stdin.setEncoding("utf8");
    process.stdin.on("data",chunk=>{
      const line=String(chunk).trim();
      if(line) behavior.onConsoleMessage(line).catch(e=>console.error("[Console]",e));
    });
  }
  bot.on("playerJoined",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","joined at "+JSON.stringify(p.entity?.position||{}),1);});
  bot.on("playerLeft",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","left the server",1);});
  bot.on("health",()=>{if(bot.food<12||bot.health<8)behavior?.onOwnerMessage("").catch(()=>{});});
  bot.on("death",()=>{game.stop();memory.remember(config.owner,"event","I died and will recover.",5);setTimeout(()=>bot.chat("I am back."),2500);});
  bot.on("kicked",r=>console.error("[YazoniBot] Kicked:",r));
  bot.on("error",e=>console.error("[YazoniBot] Error:",e));
  bot.on("end",reason=>console.warn("[YazoniBot] Minecraft connection ended:",reason));
  bot.on("end",reason=>{behavior?.stop();console.log("[YazoniBot] Disconnected:",reason);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(makeBot,config.reconnectMs);});
}
process.on("SIGINT",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
process.on("SIGTERM",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
makeBot();