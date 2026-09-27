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
  bot.once("spawn",async()=>{game.ready();game.setHome();await game.equipArmor();behavior.start();console.log("[YazoniBot] Spawned. Listening ONLY to "+config.owner);bot.chat("I am here.");});
  bot.on("chat",async(username,message)=>{
    if(username===bot.username)return;
    const isOwner=username.toLowerCase()===String(config.owner).toLowerCase();
    console.log(`[YazoniBot] Chat from ${username}: ${message}${isOwner?" [OWNER]":" [IGNORED]"}`);
    if(!isOwner)return;
    memory.remember(username,"chat",message,4);
    try{await behavior.onOwnerMessage(message)}catch(e){console.error("[YazoniBot] Owner handler failed:",e)}
  });
  bot.on("playerJoined",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","joined",1);});
  bot.on("playerLeft",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","left",1);});
  bot.on("kicked",r=>console.error("[YazoniBot] Kicked:",r));
  bot.on("error",e=>console.error("[YazoniBot] Error:",e));
  bot.on("end",reason=>{behavior?.stop();console.warn("[YazoniBot] Disconnected:",reason);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(makeBot,config.reconnectMs);});
}
process.on("unhandledRejection",e=>console.error("[YazoniBot] UNHANDLED REJECTION:",e));
process.on("uncaughtException",e=>console.error("[YazoniBot] UNCAUGHT EXCEPTION:",e));
process.on("SIGINT",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
process.on("SIGTERM",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
makeBot();
