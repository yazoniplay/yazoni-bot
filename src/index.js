import http from "node:http";
import mineflayer from "mineflayer";
import {config,botNames} from "./config.js";
import {Memory} from "./memory.js";
import {Brain} from "./ai.js";
import {GameController} from "./game.js";
import {BehaviorLoop} from "./behavior.js";
import {Gate} from "./limiter.js";
import {route} from "./router.js";

const gate=new Gate(config.geminiGapMs,config.maxQueue);
gate.model=config.model;
const instances=[];
const seenChat=new Map();
let shuttingDown=false;

class BotInstance{
  constructor(name,index){
    this.name=name;this.index=index;
    this.online=false;this.attempt=0;this.spawned=false;this.timer=null;
    this.bot=null;this.game=null;this.behavior=null;
    // Per-bot config + memory (a single bot keeps the original data/memory.json).
    this.cfg={...config,username:name,botName:name,teammates:botNames,
      followDistance:config.followDistance+(index%3), // spread out so they don't pile on one block
      memoryDb:botNames.length===1?config.memoryDb:`data/memory-${name}.db`};
    this.memory=new Memory(this.cfg.memoryDb);
  }

  connect(){
    if(shuttingDown)return;
    const c=this.cfg,tag=`[${this.name}]`;
    console.log(`${tag} Connecting to ${c.host}:${c.port}`);
    const bot=mineflayer.createBot({host:c.host,port:c.port,username:this.name,auth:c.auth,viewDistance:c.viewDistance});
    const game=new GameController(bot,this.memory,c);
    const behavior=new BehaviorLoop(game,new Brain(c,this.memory,gate),c);
    this.bot=bot;this.game=game;this.behavior=behavior;this.spawned=false;this.online=false;

    bot.on("spawn",async()=>{
      game.ready();
      if(!this.spawned){
        this.spawned=true;game.setHome();await game.equipArmor();behavior.start();
        console.log(`${tag} Spawned. Listening ONLY to ${c.owner}`);
        if(this.index===0&&botNames.length===1)bot.chat("I am here.");
      }else if(c.autoFollow){game.follow(c.owner);} // respawned after dying
      this.online=true;this.attempt=0;
    });
    bot.on("death",()=>{this.memory.remember(c.owner,"event","I died",5);game.cancelMovement();});
    bot.on("chat",(username,message)=>{
      if(username===bot.username||botNames.includes(username))return;
      dispatchChat(username,message);
    });
    bot.on("playerJoined",p=>{if(p.username!==bot.username)this.memory.remember(p.username,"presence","joined",1);});
    bot.on("playerLeft",p=>{if(p.username!==bot.username)this.memory.remember(p.username,"presence","left",1);});
    bot.on("kicked",r=>console.error(`${tag} Kicked:`,r));
    bot.on("error",e=>console.error(`${tag} Error:`,e));
    bot.on("end",reason=>{
      behavior.stop();this.online=false;
      console.warn(`${tag} Disconnected:`,reason);
      if(shuttingDown)return;
      const delay=Math.min(60000,c.reconnectMs*2**this.attempt++); // back off if the server keeps refusing us
      clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect(),delay);
    });
  }

  handle(text,opts){return this.behavior?.onOwnerMessage(text,opts);}
  shutdown(){clearTimeout(this.timer);this.behavior?.stop();this.memory.close();try{this.bot?.quit("shutdown")}catch{}}
}

// Every bot hears every chat line; handle each exactly once and route it.
function dispatchChat(username,message){
  const now=Date.now(),key=username+"\n"+message;
  for(const [k,t] of seenChat)if(now-t>3000)seenChat.delete(k);
  if(seenChat.has(key))return;
  seenChat.set(key,now);
  const isOwner=username.toLowerCase()===String(config.owner).toLowerCase();
  console.log(`[chat] ${username}: ${message}${isOwner?" [OWNER]":" [IGNORED]"}`);
  if(!isOwner)return;
  const online=instances.filter(i=>i.online);
  for(const plan of route(message,online.map(i=>i.name))){
    const inst=online.find(i=>i.name===plan.name);
    inst.memory.remember(config.owner,"chat",message,4);
    Promise.resolve(inst.handle(plan.text,{speak:plan.speak,brain:plan.brain}))
      .catch(e=>console.error(`[${inst.name}] Owner handler failed:`,e));
  }
}

const renderPort=Number(process.env.PORT)||10000;
http.createServer((req,res)=>{
  res.writeHead(200,{"content-type":"text/plain"});
  res.end(`YazoniBot online: ${instances.filter(i=>i.online).length}/${instances.length} bots connected`);
}).listen(renderPort,"0.0.0.0",()=>console.log("[YazoniBot] Health port listening on "+renderPort));

function shutdown(){shuttingDown=true;instances.forEach(i=>i.shutdown());process.exit(0);}
process.on("unhandledRejection",e=>console.error("[YazoniBot] UNHANDLED REJECTION:",e));
process.on("uncaughtException",e=>console.error("[YazoniBot] UNCAUGHT EXCEPTION:",e));
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);

console.log(`[YazoniBot] Starting ${botNames.length} bot(s): ${botNames.join(", ")}`);
botNames.forEach((name,i)=>{
  const inst=new BotInstance(name,i);
  instances.push(inst);
  setTimeout(()=>inst.connect(),i*config.joinDelayMs); // staggered joins avoid connection throttling
});
