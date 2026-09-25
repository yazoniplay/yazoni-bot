import fs from "node:fs";
import path from "node:path";
import {execFileSync,spawn} from "node:child_process";

const root=path.resolve(".mindcraft");
const repoUrl="https://github.com/mindcraft-bots/mindcraft.git";
const ref="v0.1.4";
const mineflayerVersion=process.env.MINEFLAYER_VERSION||"4.35.0";

function run(cmd,args,cwd=process.cwd()){
  console.log("[YazoniBot]",cmd,args.join(" "));
  execFileSync(cmd,args,{cwd,stdio:"inherit",env:process.env});
}

if(!fs.existsSync(path.join(root,"main.js"))){
  if(fs.existsSync(root)) fs.rmSync(root,{recursive:true,force:true});
  run("git",["clone","--depth","1","--branch",ref,repoUrl,root]);
}

const pkgPath=path.join(root,"package.json");
const pkg=JSON.parse(fs.readFileSync(pkgPath,"utf8"));
pkg.dependencies={...(pkg.dependencies||{}),mineflayer:mineflayerVersion};
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+"\n");

run("npm",["install","--no-audit","--no-fund","--include=dev"],root);

fs.mkdirSync(path.join(root,"profiles"),{recursive:true});
const profile={
  name:process.env.BOT_NAME||"YazoniBot",
  model:process.env.GEMINI_MODEL||"gemini-3.5-flash-lite",
  cooldown:Number(process.env.AI_COOLDOWN_MS||5000),
  speak_model:process.env.GEMINI_TTS_MODEL||"google/gemini-2.5-flash-preview-tts/Kore"
};
fs.writeFileSync(path.join(root,"profiles","yazoni.json"),JSON.stringify(profile,null,2));
fs.writeFileSync(path.join(root,"keys.json"),JSON.stringify({
  GEMINI_API_KEY:process.env.GEMINI_API_KEY||""
},null,2));

const settings={
  minecraft_version:process.env.MC_VERSION||"auto",
  host:process.env.MC_HOST||"localhost",
  port:Number(process.env.MC_PORT||25565),
  auth:process.env.MC_AUTH||"offline",
  mindserver_port:Number(process.env.MINDSERVER_PORT||8080),
  auto_open_ui:false,
  base_profile:"assistant",
  profiles:["./profiles/yazoni.json"],
  load_memory:true,
  init_message:"You are YazoniBot. Join Yazoni, stay close, and behave like a funny Minecraft companion made for YouTube videos.",
  only_chat_with:process.env.OWNER_USERNAME?[process.env.OWNER_USERNAME]:[],
  speak:process.env.SPEAK==="true",
  chat_ingame:true,
  language:"en",
  render_bot_view:false,
  allow_insecure_coding:false,
  allow_vision:false,
  blocked_actions:[],
  relevant_docs_count:5,
  max_messages:Number(process.env.MAX_MESSAGES||15),
  num_examples:2,
  max_commands:-1,
  show_command_syntax:"shortened",
  narrate_behavior:true,
  chat_bot_messages:true,
  spawn_timeout:30,
  block_place_delay:0,
  log_all_prompts:false
};

process.env.SETTINGS_JSON=JSON.stringify(settings);
process.env.PROFILES=JSON.stringify(["./profiles/yazoni.json"]);

if(process.argv.includes("--start")){
  const child=spawn(process.execPath,["main.js"],{
    cwd:root,
    stdio:"inherit",
    env:process.env
  });
  child.on("exit",code=>process.exit(code??0));
}