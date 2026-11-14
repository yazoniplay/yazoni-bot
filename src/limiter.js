// Shared by every bot: Gemini calls run one at a time with a minimum gap,
// so many bots can't blow through the API rate limit together.
export class Gate{
  constructor(minGapMs=4000,maxQueue=6){
    this.minGap=minGapMs;this.maxQueue=maxQueue;
    this.chain=Promise.resolve();this.last=0;this.coolUntil=0;this.pending=0;
    this.model=null; // shared active model (flips to the fallback for every bot at once)
  }
  penalize(ms){this.coolUntil=Math.max(this.coolUntil,Date.now()+ms);}
  run(fn){
    if(this.pending>=this.maxQueue)return Promise.reject(new Error("Gemini queue full"));
    this.pending++;
    const job=this.chain.then(async()=>{
      const wait=Math.max(this.last+this.minGap,this.coolUntil)-Date.now();
      if(wait>0)await new Promise(r=>setTimeout(r,wait));
      this.last=Date.now();
      return fn();
    }).finally(()=>{this.pending--;});
    this.chain=job.catch(()=>{});
    return job;
  }
}
