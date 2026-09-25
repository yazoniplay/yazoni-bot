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
  bot.on("chat",async(username,message)=>{if(username===bot.username)return;memory.remember(username,"chat",message,username===config.owner?4:1);if(username===config.owner)await behavior.onOwnerMessage(message);else if(message.toLowerCase().includes(config.botName.toLowerCase()))await behavior.onOwnerMessage("Player "+username+" said: "+message);});
  bot.on("playerJoined",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","joined at "+JSON.stringify(p.entity?.position||{}),1);});
  bot.on("playerLeft",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","left the server",1);});
  bot.on("health",()=>{if(bot.food<12||bot.health<8)behavior?.onOwnerMessage("").catch(()=>{});});
  bot.on("death",()=>{game.stop();memory.remember(config.owner,"event","I died and will recover.",5);setTimeout(()=>bot.chat("I am back."),2500);});
  bot.on("kicked",r=>console.error("[YazoniBot] Kicked:",r));bot.on("error",e=>console.error("[YazoniBot] Error:",e));
  bot.on("end",reason=>{behavior?.stop();console.log("[YazoniBot] Disconnected:",reason);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(makeBot,config.reconnectMs);});
}
process.on("SIGINT",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
process.on("SIGTERM",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
makeBot();