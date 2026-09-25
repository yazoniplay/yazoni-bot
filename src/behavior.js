import {goals} from "mineflayer-pathfinder";
const {GoalNear}=goals;
export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.enabled=true;this.timer=null;this.busy=false;this.lastPlan=0;}
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>console.error("[Behavior]",e)),12000);}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  async tick(){
    if(!this.enabled||this.busy||!this.game.bot?.entity)return;
    if(Date.now()-this.lastPlan<30000)return;
    this.busy=true;
    try{
      const state=this.game.state();
      const owner=this.game.bot.players[this.config.owner]?.entity;
      if(state.food!==undefined&&state.food<8){await this.eatIfPossible();return;}
      if(this.game.following||!owner)return;
      const distance=owner.position.distanceTo(this.game.bot.entity.position);
      if(distance>18&&distance<80){this.game.bot.pathfinder.setGoal(new GoalNear(owner.position.x,owner.position.y,owner.position.z,5));return;}
      const plan=await this.brain.plan("Act naturally as a Minecraft companion. Choose one small useful action from the current state. Do not be destructive.",state);
      this.lastPlan=Date.now();
      if(plan?.say)this.game.say(plan.say);
      if(plan?.action==="attack")this.game.attackNearest(plan.target||null);
      else if((plan?.action==="collect"||plan?.action==="mine")&&plan.item)await this.game.collect(plan.item,plan.count||1);
      else if(plan?.action==="goto"&&[plan.x,plan.y,plan.z].every(v=>v!==null&&v!==undefined))await this.game.goto(plan.x,plan.y,plan.z);
    }finally{this.busy=false;}
  }
  async eatIfPossible(){
    const foods=["bread","cooked_beef","cooked_porkchop","cooked_chicken","cooked_mutton","cooked_salmon","cooked_cod","baked_potato","carrot","apple"];
    const item=this.game.bot.inventory.items().find(i=>foods.includes(i.name));
    if(!item)return;
    try{await this.game.bot.equip(item,"hand");await this.game.bot.consume();}catch{}
  }
}
