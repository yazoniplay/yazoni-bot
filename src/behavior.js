export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.timer=null;this.busy=false;this.lastThinkAt=0;this.lastProactiveChat=0;this.commandId=0;}
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>console.error("[Behavior]",e)),this.config.thinkMs);this.tick().catch(e=>console.error("[Behavior]",e));}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}

  async onOwnerMessage(message){
    const text=String(message||"").trim();
    this.commandId++;
    const id=this.commandId;
    if(/^(?:stop|stay|wait|stop following|cancel)$/i.test(text)){this.game.stop();this.game.say("Stopping.");return;}
    this.game.cancelMovement();
    await this.runBrain(text,id,true);
  }

  async onPlayerMessage(username,message){
    const text=String(message||"").trim();
    if(!text || username===this.game.bot.username)return;
    // Every player can talk to YazoniBot. Keep the identity in the prompt so
    // Gemini can answer the correct person instead of treating every message as owner input.
    this.commandId++;
    const id=this.commandId;
    await this.runBrain(`Player ${username} said: ${text}`,id,false);
  }

  async onConsoleMessage(message){
    const text=String(message||"").trim();
    if(!text)return;
    this.commandId++;
    const id=this.commandId;
    await this.runBrain(`SERVER CONSOLE said: ${text}`,id,false);
  }

  async tick(){
    if(this.busy||!this.game.bot?.entity)return;
    if(Date.now()-this.lastThinkAt<Math.max(1000,this.config.thinkMs-250))return;
    await this.runBrain("",this.commandId,false);
  }

  async runBrain(input,id,ownerMessage){
    if(this.busy)return;
    this.busy=true;
    this.lastThinkAt=Date.now();
    try{
      if(this.game.bot.food<10)await this.game.action({action:"eat"});
      const result=await this.brain.runAgent(input,this.game.state(),async(name,args)=>{
        if(ownerMessage&&id!==this.commandId)return{ok:false,error:"Cancelled by a newer owner message."};
        const mapped=this.mapTool(name,args);
        if(!mapped)return{ok:false,error:"Unknown tool: "+name};
        try{
          const ok=await this.game.action(mapped);
          const state=this.game.state();
          this.game.memory.remember(this.config.owner,"ai_action",name+" "+JSON.stringify(args)+" => "+(ok?"ok":"failed"),ok?1:3);
          return{ok,state,lastAction:this.game.lastAction};
        }catch(e){
          return{ok:false,error:e.message,state:this.game.state()};
        }
      });
      if(ownerMessage&&id!==this.commandId)return;
      if(result.reply&&(!input?Date.now()-this.lastProactiveChat>=this.config.proactiveChatMs:true)){
        this.game.say(result.reply);
        if(!input)this.lastProactiveChat=Date.now();
      }
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
