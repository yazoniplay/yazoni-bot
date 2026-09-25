import {pathfinder,Movements,goals} from "mineflayer-pathfinder";
import pvpPlugin from "mineflayer-pvp";
import collectBlock from "mineflayer-collectblock";
import toolPlugin from "mineflayer-tool";
const {GoalNear,GoalFollow}=goals;
export class GameController{
 constructor(bot,memory,config){this.bot=bot;this.memory=memory;this.config=config;bot.loadPlugin(pathfinder);bot.loadPlugin(pvpPlugin);bot.loadPlugin(collectBlock.plugin);bot.loadPlugin(toolPlugin);this.movements=new Movements(bot);this.following=null;this.home=null;this.task=null;}
 ready(){this.bot.pathfinder.setMovements(this.movements);}
 state(){const p=this.bot.entity?.position;return {position:p?{x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1)}:null,health:this.bot.health,food:this.bot.food,dimension:this.bot.game?.dimension,players:Object.keys(this.bot.players).slice(0,20),inventory:this.bot.inventory.items().slice(0,20).map(i=>({name:i.name,count:i.count}))};}
 async follow(name){const target=this.bot.players[name]?.entity;if(!target)return false;this.following=name;this.bot.pathfinder.setGoal(new GoalFollow(target,2),true);this.say("On my way.");return true;}
 stop(){this.following=null;this.bot.pathfinder.setGoal(null);this.task=null;}
 async come(name){const p=this.bot.players[name]?.entity;if(!p)return false;this.bot.pathfinder.setGoal(new GoalNear(p.position.x,p.position.y,p.position.z,2));return true;}
 async goto(x,y,z){this.following=null;this.bot.pathfinder.setGoal(new GoalNear(Number(x),Number(y),Number(z),2));}
 setHome(){if(this.bot.entity)this.home=this.bot.entity.position.clone();}
 async goHome(){if(!this.home)return false;this.bot.pathfinder.setGoal(new GoalNear(this.home.x,this.home.y,this.home.z,2));return true;}
 async collect(item,count=1){const blocks=this.bot.findBlocks({matching:b=>b&&b.name.includes(item),maxDistance:48,count:Math.max(1,Number(count))});if(!blocks.length)return false;const positions=blocks.map(p=>this.bot.blockAt(p)).filter(Boolean);this.task={type:"collect",item,count:Number(count)};try{await this.bot.collectBlock.collect(positions.slice(0,Number(count)));}finally{this.task=null;}return true;}
 attackNearest(name){const target=name?this.bot.players[name]?.entity:this.bot.nearestEntity(e=>e.type==="mob");if(!target)return false;this.bot.pvp.attack(target);return true;}
 say(msg){if(msg)this.bot.chat(String(msg).slice(0,240));}
}
