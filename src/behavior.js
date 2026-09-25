export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.timer=null;this.busy=false;this.lastPlanAt=0;}
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>console.error("[Behavior]",e)),this.config.thinkMs);this.tick().catch(e=>console.error("[Behavior]",e));}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  async onOwnerMessage(message){if(this.busy)return;await this.runThought(message);}
  async tick(){if(this.busy||!this.game.bot?.entity)return;if(Date.now()-this.lastPlanAt<Math.max(5000,this.config.thinkMs-1000))return;await this.runThought("");}
  async runThought(input){
    this.busy=true;
    try{
      if(this.config.autoFollow&&!this.game.following){const owner=this.game.bot.players[this.config.owner]?.entity;if(owner){const d=this.game.bot.entity.position.distanceTo(owner.position);if(d>this.config.followDistance&&d<80)this.game.follow(this.config.owner);}}
      const state=this.game.state();
      if(state.food!==undefined&&state.food<14)await this.game.action({action:"eat"});await this.game.action({action:"equip"});if(!this.game.busy)await this.game.action({action:"pickup"});
      const thought=await this.brain.think(input,state);this.lastPlanAt=Date.now();
      if(thought.reply&&input)this.game.say(thought.reply);
      for(const step of (Array.isArray(thought.steps)?thought.steps.slice(0,this.config.maxPlanSteps):[])){
        if(!this.game.bot?.entity)break;
        if(this.config.autoFollow&&!this.game.following){const owner=this.game.bot.players[this.config.owner]?.entity;if(owner&&this.game.bot.entity.position.distanceTo(owner.position)>this.config.followDistance)this.game.follow(this.config.owner);}
        if(this.game.bot.health<5){await this.game.action({action:"eat"});break;}
        const ok=await this.game.action(step);
        this.game.memory.remember(this.config.owner,"action",step.action+(step.item?" "+step.item:"")+" => "+(ok?"ok":"failed"),ok?1:3);
        if(!ok&&["mine","collect","craft","smelt","build","farm"].includes(step.action))break;
      }
      if(this.game.lastAction)this.game.memory.remember(this.config.owner,"world_action",this.game.lastAction,1);
    }finally{this.busy=false;}
  }
}