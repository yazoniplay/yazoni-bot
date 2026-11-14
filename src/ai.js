import {GoogleGenAI} from "@google/genai";

const toolDefs=[
  {name:"follow_owner",description:"Follow Yazoni continuously.",parameters:{type:"object",properties:{}}},
  {name:"come_to_owner",description:"Go directly to Yazoni and stop near him.",parameters:{type:"object",properties:{}}},
  {name:"stop",description:"Stop all movement immediately.",parameters:{type:"object",properties:{}}},
  {name:"move_to",description:"Pathfind to exact coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}},required:["x","y","z"]}},
  {name:"move",description:"Manually move briefly. direction is forward,back,left,right. duration_ms 150-1500. Use this for precise moment-to-moment control.",parameters:{type:"object",properties:{direction:{type:"string",enum:["forward","back","left","right"]},duration_ms:{type:"integer"}},required:["direction","duration_ms"]}},
  {name:"look_at",description:"Look at exact coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}},required:["x","y","z"]}},
  {name:"jump",description:"Jump once.",parameters:{type:"object",properties:{}}},
  {name:"attack",description:"Attack the nearest matching hostile mob.",parameters:{type:"object",properties:{target:{type:"string"}}}},
  {name:"mine",description:"Find and mine a nearby block type.",parameters:{type:"object",properties:{block:{type:"string"},count:{type:"integer"}},required:["block"]}},
  {name:"mine_direction",description:"Mine straight up or down.",parameters:{type:"object",properties:{direction:{type:"string",enum:["up","down"]},count:{type:"integer"}},required:["direction"]}},
  {name:"craft",description:"Craft an item.",parameters:{type:"object",properties:{item:{type:"string"},count:{type:"integer"}},required:["item"]}},
  {name:"eat",description:"Eat food.",parameters:{type:"object",properties:{}}},
  {name:"pickup",description:"Pick up nearby dropped items.",parameters:{type:"object",properties:{}}},
  {name:"equip",description:"Equip useful armor.",parameters:{type:"object",properties:{}}},
  {name:"drop",description:"Drop an inventory item.",parameters:{type:"object",properties:{item:{type:"string"},count:{type:"integer"}},required:["item"]}},
  {name:"sleep",description:"Sleep in a nearby bed.",parameters:{type:"object",properties:{}}},
  {name:"harvest",description:"Harvest nearby crops.",parameters:{type:"object",properties:{}}},
  {name:"farm",description:"Farm nearby crops.",parameters:{type:"object",properties:{}}},
  {name:"build",description:"Build a simple structure.",parameters:{type:"object",properties:{block:{type:"string"},pattern:{type:"string"}},required:["block"]}},
  {name:"store",description:"Store valuables in a nearby chest/barrel.",parameters:{type:"object",properties:{}}},
  {name:"avoid",description:"Move away from nearby hostile danger.",parameters:{type:"object",properties:{}}},
  {name:"explore",description:"Wander off to explore somewhere new.",parameters:{type:"object",properties:{}}},
  {name:"smelt",description:"Smelt an inventory item in a nearby furnace.",parameters:{type:"object",properties:{item:{type:"string"},count:{type:"integer"}},required:["item"]}}
];
const declarations=toolDefs.map(({name,description,parameters})=>({name,description,parameters}));

export class Brain{
  constructor(config,memory,gate){
    this.config=config;this.memory=memory;this.gate=gate;
    this.client=config.apiKey?new GoogleGenAI({apiKey:config.apiKey}):null;
    if(gate&&!gate.model)gate.model=config.model;
  }
  get model(){return this.gate?.model||this.config.model;}
  context(state){
    return "BOT STATE:\n"+JSON.stringify(state)+"\n\nOWNER MEMORY:\n"+
      this.memory.recent(this.config.owner,8).map(m=>m.content).join(" | ");
  }
  systemInstruction(){
    const c=this.config,mates=(c.teammates||[]).filter(n=>n!==c.botName);
    return `You are ${c.botName}, a loyal Minecraft companion for ${c.owner}. ${c.personality} `+
      (mates.length?`You play alongside teammate bots (${mates.join(", ")}) who also follow ${c.owner}; you are your own character, so don't copy their lines. `:"")+
      `Gemini is the REAL decision maker; Mineflayer only executes your commands. Be funny, quick, confident, playful and reactive. Roast harmless situations, celebrate wins, panic at danger, and make occasional memorable comments — but NEVER let personality replace an action. When ${c.owner} asks for something actionable, call the correct tool immediately. Do not explain a plan first. Prefer low-level move/look/jump/attack tools when useful. Chain a few tools when needed. Use tool results as truth, correct mistakes, never invent state, and stay near ${c.owner} when practical. Keep chat short and natural. You are actually playing Minecraft, not merely chatting about it.`;
  }
  async generate(model,input){
    return this.client.interactions.create({
      model,input,
      system_instruction:this.systemInstruction(),
      generation_config:{thinking_level:"minimal"},
      tools:declarations.map(({name,description,parameters})=>({type:"function",name,description,parameters}))
    });
  }
  // All bots share one gate (serial calls + min gap). Rate-limit errors back every bot off;
  // a missing/unsupported model switches everyone to the fallback model.
  async callModel(prompt){
    try{return await this.gate.run(()=>this.generate(this.model,prompt));}
    catch(e){
      const msg=String(e?.message||e);
      if(/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)){this.gate.penalize(15000);throw e;}
      const fb=this.config.fallbackModel;
      if(fb&&fb!==this.model&&/404|NOT_FOUND|not found|not supported/i.test(msg)){
        console.warn(`[${this.config.botName}] Model ${this.model} unavailable, switching everyone to ${fb}`);
        this.gate.model=fb;
        return await this.gate.run(()=>this.generate(fb,prompt));
      }
      throw e;
    }
  }
  async runAgent(input,state,execute){
    if(!this.client)return {reply:"Gemini is not configured.",actions:0};
    const prompt=this.context(state)+"\n\nOWNER COMMAND:\n"+input+"\n\nAct now. Execute the command with tools. If movement is needed, actually move.";
    let totalActions=0;
    try{
      console.log(`[${this.config.botName}] Gemini thinking (${this.model}): ${input}`);
      const interaction=await this.callModel(prompt);
      const calls=(interaction.steps||[]).filter(s=>s.type==="function_call").slice(0,this.config.maxPlanSteps||6);
      for(const call of calls){
        let result;
        try{result=await execute(call.name,call.arguments||{})}catch(e){result={ok:false,error:e.message}}
        totalActions++;
        if(!result?.ok) console.warn(`[${this.config.botName}] action failed`,call.name,result?.error||"unknown");
      }
      console.log(`[${this.config.botName}] Gemini done: ${totalActions} action(s), reply: ${JSON.stringify(interaction.output_text||"")}`);
      return {reply:interaction.output_text||"",actions:totalActions};
    }catch(e){
      console.error(`[${this.config.botName}] Gemini:`,e.message);
      return {reply:"",actions:totalActions};
    }
  }
}
