export class BehaviorLoop{
  constructor(game,brain,config){this.game=game;this.brain=brain;this.config=config;this.busy=false;this.commandId=0;this.lookTimer=null;this.followTimer=null;}

  start(){
    this.stop();
    // Idle: keep looking at the owner (does nothing while pathfinding/acting, those steer on their own).
    this.lookTimer=setInterval(()=>{try{this.game.idleLook()}catch{}},200);
    // Auto-follow: the owner may not be in view right after joining, so retry for ~30s.
    if(this.config.autoFollow){
      let tries=0;
      this.followTimer=setInterval(()=>{
        if(this.game.following||++tries>30){clearInterval(this.followTimer);this.followTimer=null;return;}
        this.game.follow(this.config.owner);
      },1000);
    }
    console.log(`[${this.config.botName}] Ready.`);
  }
  stop(){
    clearInterval(this.lookTimer);clearInterval(this.followTimer);
    this.lookTimer=null;this.followTimer=null;this.busy=false;
  }

  // opts.speak: may this bot talk in chat (group messages: only the lead does)
  // opts.brain: may this bot ask Gemini if the message isn't a simple local command
  async onOwnerMessage(message,{speak=true,brain=true}={}){
    clearInterval(this.followTimer);this.followTimer=null; // owner took control, stop auto-follow retries
    const text=String(message||"").trim();
    const say=m=>{if(speak)this.game.say(m);};
    if(!text){say("Yo "+this.config.owner+" 😎");return;}
    this.commandId++;
    const id=this.commandId;

    // Common commands are handled locally so Gemini can never block basic control.
    if(/^(?:stop|stay|wait|stop following|cancel)$/i.test(text)){this.game.stop();say("Stopping.");return;}
    if(/^(?:hi|hello|hey|yo)(?:[!. ]*)$/i.test(text)){say("Yo "+this.config.owner+" 😎");return;}
    if(/^(?:follow me|follow)$/i.test(text)){this.game.action({action:"follow_owner"});say("Following you.");return;}
    if(/^(?:come here|come to me|come)$/i.test(text)){const ok=await this.game.action({action:"come_owner"});say(ok?"Coming.":"I can't see you.");return;}
    if(/^(?:go home|home)$/i.test(text)){const h=this.game.home;const ok=h?await this.game.action({action:"goto",x:h.x,y:h.y,z:h.z}):false;say(ok?"Going home.":"No home set.");return;}
    if(/^(?:eat|eat food)$/i.test(text)){const ok=await this.game.action({action:"eat"});say(ok?"Eating.":"I have no food.");return;}
    const up=text.match(/^(?:mine|dig)\s+(up|down)(?:\s+(\d+))?$/i);
    if(up){const ok=await this.game.action({action:"mine_direction",item:up[1].toLowerCase(),count:Number(up[2])||8});say(ok?"Mining "+up[1]+".":"I can't mine that direction.");return;}
    const mine=text.match(/^(?:mine|collect|get)\s+(.+?)(?:\s+(\d+))?$/i);
    if(mine){const ok=await this.game.action({action:"mine",item:mine[1],count:Number(mine[2])||1});say(ok?"On it.":"I couldn't find that nearby.");return;}
    const attack=text.match(/^(?:attack|kill|fight)(?:\s+(.+))?$/i);
    if(attack){const ok=await this.game.action({action:"hit",item:attack[1]||""});say(ok?"Fighting.":"No target nearby.");return;}

    if(!brain)return; // not this bot's conversation
    this.game.cancelMovement();
    await this.runBrain(text,id,speak);
  }

  async onPlayerMessage(){/* owner-only mode: ignored */}
  async onConsoleMessage(){/* owner-only mode: ignored */}

  async runBrain(input,id,speak=true){
    if(this.busy)return;
    this.busy=true;
    let spoke=false;
    try{
      const result=await this.brain.runAgent(input,this.game.state(),async(name,args)=>{
        if(id!==this.commandId)return{ok:false,error:"Cancelled by a newer owner message."};
        if(name==="say"){if(speak&&args?.message){this.game.say(args.message);spoke=true;}return{ok:true};}
        const mapped=this.mapTool(name,args);
        if(!mapped)return{ok:false,error:"Unknown tool: "+name};
        try{
          const ok=await this.game.action(mapped);
          const state=this.game.state();
          this.game.memory.remember(this.config.owner,"ai_action",name+" "+JSON.stringify(args)+" => "+(ok?"ok":"failed"),ok?1:3);
          return{ok,state,lastAction:this.game.lastAction};
        }catch(e){return{ok:false,error:e.message,state:this.game.state()};}
      });
      if(id!==this.commandId)return;
      if(speak&&!spoke){ // the owner always gets an answer
        if(result.reply)this.game.say(result.reply);
        else this.game.say(result.actions?"On it.":"Hm, my brain gave me nothing. Say that again?");
      }
    }catch(e){
      console.error(`[${this.config.botName}] Owner command failed:`,e);
      if(speak)this.game.say("My brain errored. Check the logs.");
    }finally{this.busy=false;}
  }

  mapTool(name,args){
    switch(name){
      case"follow_owner":return{action:"follow_owner"};
      case"come_to_owner":return{action:"come_owner"};
      case"stop":return{action:"stop"};
      case"move_to":return{action:"goto",x:args.x,y:args.y,z:args.z};
      case"move":return{action:"move",direction:args.direction,durationMs:args.duration_ms||400};
      case"look_at":return{action:"look_at",x:args.x,y:args.y,z:args.z};
      case"jump":return{action:"jump"};
      case"explore":return{action:"explore"};
      case"smelt":return{action:"smelt",item:args.item,count:args.count||1};
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
