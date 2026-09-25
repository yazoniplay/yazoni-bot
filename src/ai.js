import {GoogleGenAI} from "@google/genai";

const toolDefs=[
  {name:"follow_owner",description:"Follow Yazoni continuously.",parameters:{type:"object",properties:{}}},
  {name:"come_to_owner",description:"Move directly to Yazoni and stop near him.",parameters:{type:"object",properties:{}}},
  {name:"stop",description:"Immediately stop movement and current navigation.",parameters:{type:"object",properties:{}}},
  {name:"move_to",description:"Move to exact Minecraft coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}},required:["x","y","z"]}},
  {name:"explore",description:"Explore the nearby world when there is a useful reason to do so.",parameters:{type:"object",properties:{}}},
  {name:"mine",description:"Find and mine the requested block type nearby. Use normal Minecraft names such as oak_log, stone, iron_ore, hay_block.",parameters:{type:"object",properties:{block:{type:"string"},count:{type:"integer"}},required:["block"]}},
  {name:"mine_direction",description:"Mine straight upward or downward from the bot's current position.",parameters:{type:"object",properties:{direction:{type:"string",enum:["up","down"]},count:{type:"integer"}},required:["direction"]}},
  {name:"attack",description:"Attack a hostile mob. If target is omitted, attack the nearest hostile mob.",parameters:{type:"object",properties:{target:{type:"string"}}}},
  {name:"craft",description:"Craft the requested item, gathering simple missing ingredients when the game controller supports it.",parameters:{type:"object",properties:{item:{type:"string"},count:{type:"integer"}},required:["item"]}},
  {name:"eat",description:"Eat available food when hungry or when needed for survival.",parameters:{type:"object",properties:{}}},
  {name:"pickup",description:"Pick up nearby dropped items.",parameters:{type:"object",properties:{}}},
  {name:"equip",description:"Equip useful armor and tools.",parameters:{type:"object",properties:{}}},
  {name:"drop",description:"Drop a requested inventory item.",parameters:{type:"object",properties:{item:{type:"string"},count:{type:"integer"}},required:["item"]}},
  {name:"sleep",description:"Try to sleep in a nearby bed.",parameters:{type:"object",properties:{}}},
  {name:"harvest",description:"Harvest mature nearby crops.",parameters:{type:"object",properties:{}}},
  {name:"farm",description:"Work on a nearby farm using available seeds/crops.",parameters:{type:"object",properties:{}}},
  {name:"build",description:"Build a simple structure using an available block.",parameters:{type:"object",properties:{block:{type:"string"},pattern:{type:"string"}},required:["block"]}},
  {name:"store",description:"Store useful valuables in a nearby chest or barrel.",parameters:{type:"object",properties:{}}},
  {name:"avoid",description:"Move away from nearby hostile danger.",parameters:{type:"object",properties:{}}}
];

const declarations=toolDefs.map(({name,description,parameters})=>({name,description,parameters}));

export class Brain{
  constructor(config,memory){
    this.config=config;
    this.memory=memory;
    this.client=config.apiKey?new GoogleGenAI({apiKey:config.apiKey}):null;
    this.activeModel=config.model;
  }

  context(state){
    const recent=this.memory.recent(this.config.owner,24).map(m=>"["+m.kind+"/"+m.importance+"] "+m.content).join("\n");
    const important=this.memory.important(this.config.owner,10).map(m=>"["+m.kind+"/"+m.importance+"] "+m.content).join("\n");
    return "IMPORTANT MEMORY:\n"+(important||"(none)")+"\nRECENT MEMORY:\n"+(recent||"(none)")+"\nWORLD MEMORY:\n"+JSON.stringify(this.memory.getWorld("world",{}))+"\nCURRENT GAME STATE:\n"+JSON.stringify(state);
  }

  async generate(model,input,previousInteractionId=null){
    return this.client.interactions.create({
      model,
      input,
      ...(previousInteractionId?{previous_interaction_id:previousInteractionId}:{}),
      system_instruction:"You are "+this.config.botName+", the actual brain of an autonomous Minecraft companion controlled by Yazoni.\n\nPERSONALITY:\n"+this.config.personality+"\n\nYou control the Minecraft bot by calling tools. Do not merely describe plans.\nWhen Yazoni gives an actionable instruction, act on it immediately. Never replace an action with a joke.\nTranslate natural language into the correct Minecraft tool and arguments. Use tool results as ground truth and adapt when an action fails.\nYou may chain multiple actions when necessary. Do not randomly destroy or mine the world without a reason. Survive, stay near Yazoni when practical, and act autonomously when there is no owner message. Keep chat short and never spam.",
      tools:declarations.map(({name,description,parameters})=>({type:"function",name,description,parameters}))
    });
  }

  extract(response){
    const parts=response?.candidates?.[0]?.content?.parts||[];
    const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
    const texts=parts.filter(p=>typeof p.text==="string").map(p=>p.text).join(" ").trim();
    return {calls,text:texts};
  }

  async runAgent(input,state,execute){
    if(!this.client)return {reply:"",actions:0};
    const prompt=this.context(state)+"\n\nOWNER MESSAGE:\n"+(input||"(none — choose the most useful next action yourself)")+"\n\nDecide what the bot should do NOW. Use tools to actually act.";
    let interaction;
    let totalActions=0;
    let finalText="";
    try{
      interaction=await this.generate(this.activeModel,prompt);
      for(let turn=0;turn<10;turn++){
        const calls=(interaction.steps||[]).filter(s=>s.type==="function_call");
        if(interaction.output_text)finalText=interaction.output_text;
        if(!calls.length)break;
        const results=[];
        for(const call of calls.slice(0,3)){
          let result;
          try{result=await execute(call.name,call.arguments||{})}
          catch(e){result={ok:false,error:e.message}}
          totalActions++;
          results.push({
            type:"function_result",
            name:call.name,
            call_id:call.id,
            result:[{type:"text",text:JSON.stringify(result)}]
          });
        }
        interaction=await this.generate(this.activeModel,results,interaction.id);
      }
    }catch(e){
      console.error("[Gemini]",e.message);
      return {reply:"",actions:totalActions};
    }
    return {reply:finalText,actions:totalActions};
  }
}
