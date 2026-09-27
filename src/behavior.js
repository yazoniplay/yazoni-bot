export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.busy=false;this.commandId=0;}
  start(){console.log("[Behavior] Owner-command mode ready. No background Gemini loop.");}
  stop(){this.busy=false;}

  async onOwnerMessage(message){
    const text=String(message||"").trim();
    if(!text)return;
    this.commandId++;
    const id=this.commandId;
    const lower=text.toLowerCase();

    // Handle the common commands locally so Gemini can never block basic control.
    if(/^(?:stop|stay|wait|stop following|cancel)$/i.test(text)){this.game.stop();this.game.say("Stopping.");return;}
    if(/^(?:hi|hello|hey|yo|yazoni(bot)?)(?:[!. ]*)$/i.test(text)){this.game.say("Yo Yazoni 😎");return;}
    if(/^(?:follow me|follow)$/i.test(text)){this.game.action({action:"follow_owner"});this.game.say("Following you.");return;}
    if(/^(?:come here|come to me|come)$/i.test(text)){const ok=this.game.action({action:"come_owner"});this.game.say(ok?"Coming.":"I can't see you.");return;}
    if(/^(?:go home|home)$/i.test(text)){const ok=this.game.action({action:"goto",x:this.game.home?.x,y:this.game.home?.y,z:this.game.home?.z});this.game.say(ok?"Going home.":"No home set.");return;}
    if(/^(?:eat|eat food)$/i.test(text)){const ok=await this.game.action({action:"eat"});this.game.say(ok?"Eating.":"I have no food.");return;}
    const up=text.match(/^(?:mine|dig)\s+(up|down)(?:\s+(\d+))?$/i);
    if(up){const ok=await this.game.action({action:"mine_direction",item:up[1].toLowerCase(),count:Number(up[2])||8});this.game.say(ok?"Mining "+up[1]+".":"I can't mine that direction.");return;}
    const mine=text.match(/^(?:mine|collect|get)\s+(.+?)(?:\s+(\d+))?$/i);
    if(mine){const ok=await this.game.action({action:"mine",item:mine[1],count:Number(mine[2])||1});this.game.say(ok?"On it.":"I couldn't find that nearby.");return;}
    const attack=text.match(/^(?:attack|kill|fight)(?:\s+(.+))?$/i);
    if(attack){const ok=await this.game.action({action:"hit",item:attack[1]||""});this.game.say(ok?"Fighting.":"No target nearby.");return;}

    this.game.cancelMovement();
    await this.runBrain(text,id,true);
  }

  async onPlayerMessage(){/* owner-only mode: ignored */}
  async onConsoleMessage(){/* owner-only mode: ignored */}

  async runBrain(input,id,ownerMessage){
    if(this.busy)return;
    this.busy=true;
    try{
      const result=await this.brain.runAgent(input,this.game.state(),async(name,args)=>{
        if(ownerMessage&&id!==this.commandId)return{ok:false,error:"Cancelled by a newer owner message."};
        const mapped=this.mapTool(name,args);
        if(!mapped)return{ok:false,error:"Unknown tool: "+name};
        try{
          const ok=await this.game.action(mapped);
          const state=this.game.state();
          this.game.memory.remember(this.config.owner,"ai_action",name+" "+JSON.stringify(args)+" => "+(ok?"ok":"failed"),ok?1:3);
          return{ok,state,lastAction:this.game.lastAction};
        }catch(e){return{ok:false,error:e.message,state:this.game.state()};}
      });
      if(ownerMessage&&id!==this.commandId)return;
      if(result.reply)this.game.say(result.reply);
    }catch(e){
      console.error("[Behavior] Owner command failed:",e);
      this.game.say("My brain errored. Check Render logs.");
    }finally{this.busy=false;}
  }

  mapTool(name,args){
    switch(name){
      case"follow_owner":return{action:"follow_owner"};
      case"come_to_owner":return{action:"come_owner"};
      case"stop":return{action:"stop"};
      case"move_to":return{action:"goto",x:args.x,y:args.y,z:args.z};
      case"explore":return{action:"explore"};
      case"mine":return{action:"mine",item:args.block,count:args.count||1};
      case"mine_direction":return{action:"mine_direction",item:args.direction,count:args.count||8};
      case"attack":return{action:"hit",item:args.target||""};
      case"craft":return{action:"craft",item:args.item,count:args.count||1};
      case"eat":return{action:"eat"};
      case"pickup":return{action:"pickup"};
      case"equip":return{action:"equip"};
      case"drop":return{action:"drop",item:args.item,count:args.count||1};
      case"sleep":return{action:"sleep"};
      case"harvest":return{action:"harvest"};
      case"farm":return{action:"farm"};
      case"build":return{action:"build",block:args.block||"oak_planks",pattern:args.pattern||"wall"};
      case"store":return{action:"store"};
      case"avoid":return{action:"avoid"};
      default:return null;
    }
  }
}
