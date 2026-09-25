export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.timer=null;this.busy=false;this.lastPlanAt=0;this.lastProactiveChat=0;}
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>console.error("[Behavior]",e)),this.config.thinkMs);this.tick().catch(e=>console.error("[Behavior]",e));}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  normalizeMessage(message){let text=String(message||"").trim();text=text.replace(new RegExp("^\\s*"+this.config.botName+"[,:]?\\s*","i"),"");return text.toLowerCase().trim();}
  async onOwnerMessage(message){
    const text=this.normalizeMessage(message);
    const mine=text.match(/^(?:(?:go|please)\\s+)?(?:and\\s+)?mine\\s+(?:a\\s+|an\\s+|some\\s+)?(.+?)(?:\\s+(?:for|please|now))?$/i);
    if(mine){
      const item=mine[1].trim().replace(/\\s+/g," ");
      this.game.cancelMovement();
      this.game.say("Got it — mining "+item+".");
      const ok=await this.game.action({action:"mine",item,count:1});
      this.game.memory.remember(this.config.owner,"action","explicit mine "+item+" => "+(ok?"ok":"failed"),ok?1:3);
      if(!ok)this.game.say("I couldn't find "+item+" nearby, so I stopped instead of digging random blocks.");
      else this.game.say("Done. I found the "+item+".");
      return;
    }
    if(/^(stop|stay|wait)$/i.test(text)){this.game.cancelMovement();this.game.say("Stopping.");return;}
    if(/^(follow|follow me)$/i.test(text)){this.game.cancelMovement();this.game.follow(this.config.owner);this.game.say("On my way.");return;}
    if(/^come here$/i.test(text)){this.game.cancelMovement();this.game.come(this.config.owner);this.game.say("Coming.");return;}
    if(this.busy)return;
    await this.runThought(message);
  }
  async tick(){if(this.busy||!this.game.bot?.entity)return;if(Date.now()-this.lastPlanAt<Math.max(4000,this.config.thinkMs-1000))return;await this.runThought("");}
  async runThought(input){
    this.busy=true;
    try{
      if(this.config.autoFollow&&!this.game.following){const owner=this.game.bot.players[this.config.owner]?.entity;if(owner){const d=this.game.bot.entity.position.distanceTo(owner.position);if(d>this.config.followDistance&&d<80)this.game.follow(this.config.owner);}}
      const state=this.game.state();
      if(state.food!==undefined&&state.food<14)await this.game.action({action:"eat"});
      if(!this.game.busy)await this.game.action({action:"equip"});
      if(!this.game.busy)await this.game.action({action:"pickup"});
      const thought=await this.brain.think(input,state);
      this.lastPlanAt=Date.now();
      if(thought.reply&&(input||Date.now()-this.lastProactiveChat>=this.config.proactiveChatMs)){this.game.say(thought.reply);if(!input)this.lastProactiveChat=Date.now();}
      for(const step of (Array.isArray(thought.steps)?thought.steps.slice(0,this.config.maxPlanSteps):[])){
        if(!this.game.bot?.entity)break;
        if(this.config.autoFollow&&!this.game.following&&!["mine","collect","goto","explore"].includes(step.action)){const owner=this.game.bot.players[this.config.owner]?.entity;if(owner&&this.game.bot.entity.position.distanceTo(owner.position)>this.config.followDistance)this.game.follow(this.config.owner);}
        if(this.game.bot.health<5){await this.game.action({action:"eat"});break;}
        const ok=await this.game.action(step);
        this.game.memory.remember(this.config.owner,"action",step.action+(step.item?" "+step.item:"")+" => "+(ok?"ok":"failed"),ok?1:3);
        if(!ok&&["mine","collect","craft","smelt","build","farm"].includes(step.action))break;
      }
      if(this.game.lastAction)this.game.memory.remember(this.config.owner,"world_action",this.game.lastAction,1);
    }finally{this.busy=false;}
  }
}