import mineflayer from "mineflayer";
import {config} from "./config.js";
import {Memory} from "./memory.js";
import {Brain} from "./ai.js";
import {GameController} from "./game.js";
import {BehaviorLoop} from "./behavior.js";
const memory=new Memory(config.memoryDb);let bot=null,game=null,brain=null,behavior=null,reconnectTimer=null;
function makeBot(){
  console.log("[YazoniBot] Connecting to "+config.host+":"+config.port+" as "+config.username);
  bot=mineflayer.createBot({host:config.host,port:config.port,username:config.username,auth:config.auth,viewDistance:config.viewDistance});
  brain=new Brain(config,memory);game=new GameController(bot,memory,config);behavior=new BehaviorLoop(game,brain,config);
  bot.once("spawn",()=>{game.ready();game.setHome();behavior.start();console.log("[YazoniBot] Spawned.");bot.chat("Hey, I'm here.");});
  bot.on("chat",async(username,message)=>{
    if(username===bot.username)return;const lower=message.toLowerCase().trim();
    if(username===config.owner){
      memory.remember(username,"chat",message);
      if(lower==="!follow"){await game.follow(username);return;}
      if(lower==="!stop"){game.stop();bot.chat("Stopped.");return;}
      if(lower==="!come"){await game.come(username);bot.chat("Coming.");return;}
      if(lower==="!home"){await game.goHome();return;}
      if(lower==="!autoplay on"){behavior.enabled=true;bot.chat("Autoplay is on.");return;}
      if(lower==="!autoplay off"){behavior.enabled=false;game.stop();bot.chat("Autoplay is off.");return;}
      if(lower==="!status"){bot.chat("Health "+Math.round(bot.health)+", food "+Math.round(bot.food)+".");return;}
      if(lower==="!inventory"){const items=bot.inventory.items().slice(0,8).map(i=>i.name+" x"+i.count).join(", ");bot.chat(items||"My inventory is empty.");return;}
      if(lower.startsWith("!goto ")){const a=lower.slice(6).trim().split(/\s+/);if(a.length===3){await game.goto(...a);bot.chat("Going there.");}return;}
      if(lower.startsWith("!task ")){const task=message.slice(6).trim();const plan=await brain.plan(task,game.state()).catch(()=>null);if(plan)await executePlan(plan,username);else bot.chat("I couldn't plan that right now.");return;}
    }
    const addressed=lower.includes(config.botName.toLowerCase())||username===config.owner;
    if(addressed){const answer=await brain.reply({...game.state(),message,from:username}).catch(()=>null);if(answer)bot.chat(answer.replace(/^["']|["']$/g,"").slice(0,240));}
  });
  bot.on("playerJoined",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","joined the server");});
  bot.on("playerLeft",p=>{if(p.username!==bot.username)memory.remember(p.username,"presence","left the server");});
  bot.on("death",()=>{game.stop();setTimeout(()=>bot.chat("I died. Respawning and getting back to you."),2000);});
  bot.on("kicked",r=>console.log("[YazoniBot] Kicked:",r));bot.on("error",e=>console.error("[YazoniBot] Error:",e));
  bot.on("end",reason=>{behavior?.stop();console.log("[YazoniBot] Disconnected:",reason);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(makeBot,config.reconnectMs);});
}
async function executePlan(plan,owner){if(!plan||!game)return;switch(plan.action){case"follow":await game.follow(owner);break;case"come":await game.come(owner);break;case"stop":game.stop();break;case"goto":if([plan.x,plan.y,plan.z].every(v=>v!==null&&v!==undefined))await game.goto(plan.x,plan.y,plan.z);break;case"collect":case"mine":if(plan.item)await game.collect(plan.item,plan.count||1);break;case"attack":game.attackNearest(plan.target||null);break;case"chat":if(plan.say)game.say(plan.say);break;}if(plan.say&&plan.action!=="chat")game.say(plan.say);}
process.on("SIGINT",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
process.on("SIGTERM",()=>{behavior?.stop();memory.close();try{bot?.quit("shutdown")}catch{}process.exit(0)});
makeBot();
