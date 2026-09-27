import {randomUUID} from 'node:crypto';
export function createUsage({db,providerFetch}) {
 db.exec(`CREATE TABLE IF NOT EXISTS ai_usage(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,provider TEXT,model TEXT,status TEXT,created TEXT,input_tokens INTEGER,output_tokens INTEGER,characters INTEGER,estimated_usd REAL);`);
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 const today=()=>new Date().toISOString().slice(0,10);
 function summary(id){return {day:today(),receipts:db.prepare('SELECT id,provider,model,status,created,input_tokens,output_tokens,characters,estimated_usd FROM ai_usage WHERE user_id=? ORDER BY created DESC LIMIT 100').all(id),counts:db.prepare('SELECT provider,count(*) AS requests,coalesce(sum(characters),0) AS characters FROM ai_usage WHERE user_id=? AND created>=? GROUP BY provider').all(id,today()),pricingConfigured:{gemini:!!(process.env.GEMINI_INPUT_USD_PER_MILLION&&process.env.GEMINI_OUTPUT_USD_PER_MILLION),elevenlabs:!!process.env.ELEVENLABS_USD_PER_1000_CHARACTERS}};}
 async function fetchMetered(user,url,options){
  const provider=url.startsWith('https://generativelanguage.googleapis.com/')?'gemini':url.startsWith('https://api.elevenlabs.io/')?'elevenlabs':null;
  if(!provider)throw fail(500,'Unsupported metered provider.');
  const body=JSON.parse(options.body);
  const chars=provider==='elevenlabs'?[...(body.text||'')].length:0;
  const id=randomUUID(),model=provider==='gemini'?decodeURIComponent(url.split('/models/')[1].split(':')[0]):body.model_id;
  db.prepare('INSERT INTO ai_usage VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,user,provider,model,'pending',new Date().toISOString(),null,null,provider==='elevenlabs'?chars:null,null);
  try{
   const response=await providerFetch(url,options);let input=null,output=null,cost=null;
   if(provider==='gemini'&&response.ok){
    try{const data=await response.clone().json(),usage=data.usageMetadata;
     if(Number.isFinite(usage?.promptTokenCount))input=usage.promptTokenCount;
     if(Number.isFinite(usage?.candidatesTokenCount))output=usage.candidatesTokenCount+(Number.isFinite(usage.thoughtsTokenCount)?usage.thoughtsTokenCount:0);
     const inRate=Number(process.env.GEMINI_INPUT_USD_PER_MILLION),outRate=Number(process.env.GEMINI_OUTPUT_USD_PER_MILLION);
     if(input!==null&&output!==null&&process.env.GEMINI_INPUT_USD_PER_MILLION&&process.env.GEMINI_OUTPUT_USD_PER_MILLION&&Number.isFinite(inRate)&&Number.isFinite(outRate)&&inRate>=0&&outRate>=0)cost=(input*inRate+output*outRate)/1e6;
    }catch{/* Missing usage remains unknown. */}
   }
   if(provider==='elevenlabs'&&response.ok){const rate=Number(process.env.ELEVENLABS_USD_PER_1000_CHARACTERS);if(process.env.ELEVENLABS_USD_PER_1000_CHARACTERS&&Number.isFinite(rate)&&rate>=0)cost=chars*rate/1000;}
   db.prepare('UPDATE ai_usage SET status=?,input_tokens=?,output_tokens=?,estimated_usd=? WHERE id=?').run(response.ok?'completed':'provider-error',input,output,cost,id);
   return response;
  }catch(e){db.prepare('UPDATE ai_usage SET status=? WHERE id=?').run('network-error',id);throw e;}
 }
 return {fetchMetered,summary,register(app){
  app.get('/api/usage',(req,res)=>res.json(summary(req.user.id)));
 }};
}
