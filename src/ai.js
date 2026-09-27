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
  {name:"avoid",description:"Move away from nearby hostile danger.",parameters:{type:"object",properties:{}}}
];
const declarations=toolDefs.map(({name,description,parameters})=>({name,description,parameters}));

export class Brain{
  constructor(config,memory){this.config=config;this.memory=memory;this.client=config.apiKey?new GoogleGenAI({apiKey:config.apiKey}):null;this.activeModel=config.model;}
  context(state){
    return "BOT STATE:\n"+JSON.stringify(state)+"\n\nOWNER MEMORY:\n"+
      this.memory.recent(this.config.owner,8).map(m=>m.content).join(" | ");
  }
  async generate(model,input){
    return this.client.interactions.create({
      model,input,
      system_instruction:"You are YazoniBot's real-time Minecraft controller. Gemini is the decision maker; the game controller only executes your exact actions. Be decisive. When the owner asks for an action, USE TOOLS immediately. Do not answer with a plan. Do not joke instead of acting. Prefer direct movement/action tools. Use the current state as truth. Never invent coordinates or results. You may call several tools in one response when they form one short sequence. Keep chat replies under 100 characters.",
      tools:declarations.map(({name,description,parameters})=>({type:"function",name,description,parameters}))
    });
  }
  async runAgent(input,state,execute){
    if(!this.client)return {reply:"Gemini is not configured.",actions:0};
    const prompt=this.context(state)+"\n\nOWNER COMMAND:\n"+input+"\n\nAct now. Execute the command with tools. If movement is needed, actually move.";
    let interaction;
    let totalActions=0;
    try{
      interaction=await this.generate(this.activeModel,prompt);
      const calls=(interaction.steps||[]).filter(s=>s.type==="function_call").slice(0,6);
      for(const call of calls){
        let result;
        try{result=await execute(call.name,call.arguments||{})}catch(e){result={ok:false,error:e.message}}
        totalActions++;
        if(!result?.ok) console.warn("[Gemini action failed]",call.name,result?.error||"unknown");
      }
      return {reply:interaction.output_text||"",actions:totalActions};
    }catch(e){
      console.error("[Gemini]",e.message);
      return {reply:"",actions:totalActions};
    }
  }
}