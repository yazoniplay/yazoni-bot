export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.timer=null;this.busy=false;this.lastPlanAt=0;this.lastProactiveChat=0;this.commandId=0;}
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>console.error("[Behavior]",e)),this.config.thinkMs);this.tick().catch(e=>console.error("[Behavior]",e));}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  normalizeMessage(message){let text=String(message||"").trim();text=text.replace(new RegExp("^\\s*"+this.config.botName+"[,:]?\\s*","i"),"");text=text.replace(/^(?:yo|hey|bro|gng)[,!]?\\s+/i,"");return text.toLowerCase().trim();}
  async onOwnerMessage(message){
    const text=this.normalizeMessage(message);
    this.commandId++;
    const commandId=this.commandId;

    const run=async(action,label)=>{
      this.game.cancelMovement();
      this.game.say("Got it — "+label+".");
      const ok=await this.game.action(action);
      this.game.memory.remember(this.config.owner,"command",label+" => "+(ok?"ok":"failed"),ok?2:4);
      if(!ok)this.game.say("I couldn't complete that right now.");
      return ok;
    };

    if(/^(stop|stay|wait|stop following)$/i.test(text)){
      this.game.stop(); this.game.say("Stopping."); return;
    }

    if(/^(?:please\\s+)?follow(?:\\s+me)?$/i.test(text)){await run({action:"follow_owner"},"following you");return;}
    if(/^(?:come|come here|get here|come to me)$/i.test(text)){await run({action:"come_owner"},"coming to you");return;}

    const hit=text.match(/^(?:hit|attack|fight|kill)\s*(.*)$/i);
    if(hit){const target=hit[1].trim().replace(/^(?:the|a|an)\s+/i,"");await run({action:"hit",item:target},"fighting "+(target||"the nearest hostile mob"));return;}

    const direction=text.match(/^(?:please\\s+)?(?:mine|dig|break)\\s+(up|down|above|below)(?:\\s+.*)?$/i);
    if(direction){
      const dir=direction[1].toLowerCase()==="above"?"up":direction[1].toLowerCase()==="below"?"down":direction[1].toLowerCase();
      await run({action:"mine_direction",item:dir,count:8},"digging "+dir);return;
    }

    if(/^(?:get out|escape|i(?:'m| am) stuck|help me out)$/i.test(text)){
      await run({action:"explore"},"getting you unstuck");return;
    }

    const craft=text.match(/^(?:please\\s+)?(?:craft|make)\\s+(?:(\\d+)\\s+)?(?:a\\s+|an\\s+|some\\s+)?(.+?)(?:\\s+(?:please|now))?$/i);
    if(craft){
      const count=Math.max(1,Math.min(64,Number(craft[1])||1));
      await run({action:"craft",item:craft[2].trim(),count},"crafting "+(count>1?count+" ":"")+craft[2].trim());return;
    }

    const mine=text.match(/^(?:please\\s+)?(?:mine|collect|get)\\s+(?:a\\s+|an\\s+|some\\s+)?(.+?)(?:\\s+(?:please|now|for\\s+me))?$/i);
    if(mine){await run({action:"mine",item:mine[1].trim(),count:1},"mining "+mine[1].trim());return;}

    const drop=text.match(/^(?:please\\s+)?drop\\s+(?:(\\d+)\\s+)?(.+?)(?:\\s+(?:please|now))?$/i);
    if(drop){await run({action:"drop",item:drop[2].trim(),count:Number(drop[1])||1},"dropping "+drop[2].trim());return;}

    if(/^(?:eat|eat something|feed yourself)$/i.test(text)){await run({action:"eat"},"eating");return;}
    if(/^(?:explore|go explore|look around)$/i.test(text)){await run({action:"explore"},"exploring");return;}
    if(/^(?:pick up|pickup|collect nearby items)$/i.test(text)){await run({action:"pickup"},"picking that up");return;}

    if(this.busy)return;
    await this.runThought(message);
  }

  async tick(){
    if(this.busy||!this.game.bot?.entity)return;
    if(Date.now()-this.lastPlanAt<Math.max(4000,this.config.thinkMs-1000))return;
    await this.runThought("");
  }

  async runThought(input){
    this.busy=true;
    const planId=this.commandId;
    try{
      if(this.config.autoFollow&&!this.game.following){
        const owner=this.game.bot.players[this.config.owner]?.entity;
        if(owner){
          const d=this.game.bot.entity.position.distanceTo(owner.position);
          if(d>this.config.followDistance&&d<80)this.game.follow(this.config.owner);
        }
      }

      const state=this.game.state();
      if(state.food!==undefined&&state.food<14)await this.game.action({action:"eat"});
      if(!this.game.busy)await this.game.action({action:"equip"});
      if(!this.game.busy)await this.game.action({action:"pickup"});

      const thought=await this.brain.think(input,state);
      this.lastPlanAt=Date.now();
      if(planId!==this.commandId)return;

      if(thought.reply&&(input||Date.now()-this.lastProactiveChat>=this.config.proactiveChatMs)){
        this.game.say(thought.reply);
        if(!input)this.lastProactiveChat=Date.now();
      }

      // Autonomous mode is deliberately non-destructive.
      // Gemini may suggest mining/building/crafting, but those actions only happen from an explicit owner request.
      const autonomousAllowed=new Set(["idle","follow_owner","come_owner","pickup","equip","eat","sleep","avoid"]);
      for(const step of (Array.isArray(thought.steps)?thought.steps.slice(0,this.config.maxPlanSteps):[])){
        if(planId!==this.commandId)break;
        if(!this.game.bot?.entity)break;
        if(!autonomousAllowed.has(step.action))continue;

        if(this.config.autoFollow&&!this.game.following){
          const owner=this.game.bot.players[this.config.owner]?.entity;
          if(owner&&this.game.bot.entity.position.distanceTo(owner.position)>this.config.followDistance)this.game.follow(this.config.owner);
        }

        if(this.game.bot.health<5){await this.game.action({action:"eat"});break;}
        const ok=await this.game.action(step);
        this.game.memory.remember(this.config.owner,"action",step.action+(step.item?" "+step.item:"")+" => "+(ok?"ok":"failed"),ok?1:3);
      }

      if(this.game.lastAction)this.game.memory.remember(this.config.owner,"world_action",this.game.lastAction,1);
    }finally{this.busy=false;}
  }
}
