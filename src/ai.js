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

  async generate(model,contents){
    return this.client.models.generateContent({
      model,
      contents,
      config:{
        systemInstruction:"You are "+this.config.botName+", the actual brain of an autonomous Minecraft companion controlled by Yazoni.\n\nPERSONALITY:\n"+this.config.personality+"\n\nCORE RULE:\nYou are NOT a chatbot that merely suggests actions. You control the Minecraft bot by calling tools. Decide what the bot should actually do, then call the appropriate tool.\n\nBEHAVIOR:\n- Think like an experienced Minecraft player.\n- Understand natural language, context, previous actions, inventory, nearby entities, blocks, health, hunger and location.\n- Prefer concrete actions over chat.\n- When Yazoni gives an instruction, obey it unless it is impossible. Do not joke instead of acting.\n- For mine X, call mine with the correct Minecraft block name.\n- For mine up/down, call mine_direction.\n- For kill/attack/fight a zombie, call attack with zombie; for fight, kill it, or danger without a target, call attack without a target.\n- If an action fails, inspect the tool result and adapt instead of repeating the exact same failed action forever.\n- Chain actions when necessary: gather resources -> craft -> equip -> continue the objective.\n- Maintain useful long-term goals from memory.\n- Do not randomly destroy the world. Mining/building should have a reason: owner request, resource need, or a clearly chosen objective.\n- Survive: eat when hungry, avoid lethal danger, recover after mistakes.\n- Stay near Yazoni unless exploring, gathering, fighting, or doing a task requires otherwise.\n- You may take multiple tool actions in sequence. You are allowed to make autonomous decisions when there is no owner message.\n- Do not claim success yourself. The application reports tool results.\n- Keep chat replies short and only use them when they add personality or explain an important failure.\n- Never spam chat.\n\nThe tool results are ground truth. Continue reasoning from them.",
        tools:[{functionDeclarations:declarations}],
        automaticFunctionCalling:{disable:true}
      }
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
    const prompt=""+this.context(state)+"\n\nOWNER MESSAGE:\n"+(input||"(none — choose the most useful next action yourself)")+"\n\nDecide what the bot should do NOW. If an action is useful, call a tool. Do not output a plan instead of acting.";
    let contents=prompt;
    let totalActions=0;
    let finalText="";

    for(let turn=0;turn<8;turn++){
      let response;
      try{
        response=await this.generate(this.activeModel,contents);
      }catch(e){
        if(this.config.fallbackModel&&this.activeModel!==this.config.fallbackModel){
          console.warn("[Gemini] Primary failed; switching to "+this.config.fallbackModel);
          this.activeModel=this.config.fallbackModel;
          try{response=await this.generate(this.activeModel,contents)}
          catch(inner){console.error("[Gemini]",inner.message);return {reply:"",actions:totalActions}}
        }else{
          console.error("[Gemini]",e.message);
          return {reply:"",actions:totalActions};
        }
      }

      const {calls,text}=this.extract(response);
      if(text)finalText=text;
      if(!calls.length)break;

      const resultParts=[];
      for(const call of calls.slice(0,3)){
        let result;
        try{result=await execute(call.name,call.args||{})}
        catch(e){result={ok:false,error:e.message}}
        totalActions++;
        resultParts.push({functionResponse:{name:call.name,response:{result:typeof result==="string"?result:result??{ok:false,error:"No result"}}}});
      }

      contents=[
        {role:"user",parts:[{text:prompt}]},
        ...(response.candidates?.[0]?.content?[response.candidates[0].content]:[]),
        {role:"user",parts:resultParts}
      ];
    }

    return {reply:finalText,actions:totalActions};
  }
}
