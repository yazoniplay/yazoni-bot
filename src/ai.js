import {GoogleGenAI} from "@google/genai";
const schema={type:"object",properties:{reply:{type:"string"},steps:{type:"array",items:{type:"object",properties:{action:{type:"string",enum:["idle","follow_owner","come_owner","explore","mine","collect","craft","smelt","farm","harvest","build","avoid","store","sleep","eat","goto","stop"]},item:{type:"string"},count:{type:"integer"},x:{type:"number"},y:{type:"number"},z:{type:"number"},block:{type:"string"},pattern:{type:"string"},reason:{type:"string"}},required:["action"]}}},required:["reply","steps"]};
export class Brain{
  constructor(config,memory){this.config=config;this.memory=memory;this.client=config.apiKey?new GoogleGenAI({apiKey:config.apiKey}):null;}
  context(state){
    const recent=this.memory.recent(this.config.owner,24).map(m=>"["+m.kind+"/"+m.importance+"] "+m.content).join("\n");
    const important=this.memory.important(this.config.owner,10).map(m=>"["+m.kind+"/"+m.importance+"] "+m.content).join("\n");
    return "IMPORTANT MEMORY:\n"+(important||"(none)")+"\nRECENT MEMORY:\n"+(recent||"(none)")+"\nWORLD MEMORY:\n"+JSON.stringify(this.memory.getWorld("world",{}))+"\nSTATE:\n"+JSON.stringify(state);
  }
  async think(input,state){
    if(!this.client)return {reply:"",steps:[]};
    const prompt="You are "+this.config.botName+", an autonomous Minecraft survival companion.\nPersonality: "+this.config.personality+"\nYou do not wait for commands. Observe the world and make useful decisions continuously.\nPlan several concrete actions when appropriate. Handle resource acquisition and crafting chains yourself.\nYou can move, mine, collect, craft, smelt, farm, harvest, build, explore, avoid dangerous areas, store items, eat and sleep.\nProtect the owner builds and avoid destructive behavior. Never claim an action succeeded unless the application reports success.\nOWNER MESSAGE: "+(input||"(none; independently decide what to do next)")+"\n"+this.context(state);
    try{const r=await this.client.models.generateContent({model:this.config.model,contents:prompt,config:{temperature:0.35,responseMimeType:"application/json",responseSchema:schema}});return JSON.parse(r.text||"{\"reply\":\"\",\"steps\":[]}");}
    catch(e){console.error("[Gemini]",e.message);return {reply:"",steps:[]};}
  }
}