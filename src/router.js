// Decides which bot(s) handle an owner chat message. Pure functions, no dependencies.
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const GROUP_WORDS="everyone|everybody|team|guys|bots|squad|all of you|y'all";
const GROUP=new RegExp(`\\b(?:${GROUP_WORDS})(?![\\w'])`,"i");
const GROUP_LEAD=new RegExp(`^\\s*(?:hey\\s+)?(?:${GROUP_WORDS})(?![\\w'])\\s*[,:!]?\\s*`,"i");

export function stripNames(text,names){
  let t=text;
  for(const n of names)t=t.replace(new RegExp(`\\b${esc(n)}\\b\\s*[,:!]?`,"ig")," ");
  t=t.replace(/\s+/g," ").trim();
  return t.replace(/^(?:(?:and|&|,)\s*)+/i,"").replace(/(?:\s*(?:and|&|,))+$/i,"").trim();
}
export const stripGroup=text=>text.replace(GROUP_LEAD,"").trim();

// online = bot names, first one is the "lead" (the only one that talks for a group).
// Returns [{name,text,speak,brain}]:
//   named bots      -> only they act, and they talk
//   "everyone" etc. -> all act (local commands + Gemini), only the lead talks
//   anything else   -> simple commands (follow/stop/mine...) go to all, chat/Gemini only to the lead
export function route(message,online){
  if(!online.length)return [];
  const lead=online[0];
  const named=online.filter(n=>new RegExp(`\\b${esc(n)}\\b`,"i").test(message));
  if(named.length){const text=stripNames(message,named);return named.map(name=>({name,text,speak:true,brain:true}));}
  if(GROUP.test(message)){const text=stripGroup(message);return online.map(name=>({name,text,speak:name===lead,brain:true}));}
  const text=message.trim();
  return online.map(name=>({name,text,speak:name===lead,brain:name===lead}));
}
