import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './app.mjs';

test('brief privacy, citations, ownership, revisions, unlimited daily usage, receipts and Tiger consent',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'pulse-challenges-')),prior={gemini:process.env.GEMINI_API_KEY,voice:process.env.ELEVENLABS_API_KEY};process.env.GEMINI_API_KEY='test';process.env.ELEVENLABS_API_KEY='test';
 const requests=[],queries=[];let badCitation=false,failTiger=false;
 const tigerPool={query:async(sql,params)=>{queries.push({sql,params});if(failTiger)throw new Error('connection failure');return {rows:[],rowCount:0};},connect:async()=>({query:tigerPool.query,release(){}}),end:async()=>{}};
 const providerFetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,body});
  if(url.includes('elevenlabs'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});
  const payload=JSON.parse(body.contents[0].parts[0].text);
  return Response.json({usageMetadata:{promptTokenCount:101,candidatesTokenCount:42,thoughtsTokenCount:3},candidates:[{content:{parts:[{text:JSON.stringify({title:'My appointment brief',summary:'I recorded readings to discuss.',observations:[{text:'A selected reading was recorded.',recordIds:[badCitation?'foreign-record':payload.readings[0].id]}],questions:['What context should I track?'],missingInformation:['Device context']})}]}}]});
 };
 const {app,db}=createApp({databasePath:join(temp,'db.sqlite'),providerFetch,tigerPool});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-PulseSense-Request':'1',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():null,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const a=await req('/auth/register','POST',{name:'Private Name',email:'private@example.com',password:'long-password-test'}),b=await req('/auth/register','POST',{name:'Other',email:'other@example.com',password:'long-password-test'});
  await req('/preferences','PATCH',{ai:true,voice:true},a.cookie);
  const saved=await req('/records','POST',{kind:'vitals',payload:{hr:70,note:'PRIVATE NOTE OMIT'}},a.cookie),id=saved.data.record.id;
  assert.equal((await req('/briefs/preview','POST',{recordIds:[id]},b.cookie)).status,404);
  const preview=await req('/briefs/preview','POST',{recordIds:[id],observations:'Question about my readings'},a.cookie);
  assert.equal(preview.status,200);assert.equal(requests.length,0,'preview must not send external data');
  assert.ok(!JSON.stringify(preview.data.payload).includes('PRIVATE NOTE'));assert.ok(!JSON.stringify(preview.data.payload).includes('private@example.com'));assert.equal(preview.data.payload.statistics[0].mean,70);
  assert.equal((await req('/briefs/generate','POST',{previewId:preview.data.id},a.cookie)).status,400);
  assert.equal((await req('/briefs/generate','POST',{previewId:preview.data.id,confirmed:true},b.cookie)).status,403);
  const generated=await req('/briefs/generate','POST',{previewId:preview.data.id,confirmed:true},a.cookie);assert.equal(generated.status,200,JSON.stringify(generated.data));assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].body.contents[0].parts[0].text),preview.data.payload);
  assert.equal((await req('/briefs/generate','POST',{previewId:preview.data.id,confirmed:true},a.cookie)).status,409);
  assert.equal((await req('/briefs','GET',undefined,b.cookie)).data.briefs.length,0);
  const brief=generated.data.brief,edited={...brief.document,title:'Edited'};
  assert.equal((await req('/briefs/'+brief.id,'PATCH',{document:edited,revision:1},a.cookie)).status,200);
  assert.equal((await req('/briefs/'+brief.id,'PATCH',{document:edited,revision:1},a.cookie)).status,409);
  assert.equal((await req('/briefs/'+brief.id,'DELETE',undefined,b.cookie)).status,404);
  badCitation=true;const p2=await req('/briefs/preview','POST',{recordIds:[id]},a.cookie);
  assert.equal((await req('/briefs/generate','POST',{previewId:p2.data.id,confirmed:true},a.cookie)).status,502);
  assert.equal((await req('/briefs','GET',undefined,a.cookie)).data.briefs.length,1);
  let usage=(await req('/usage','GET',undefined,a.cookie)).data;assert.equal(usage.receipts.length,2);assert.equal(usage.receipts[0].input_tokens,101);assert.equal(usage.receipts[0].output_tokens,45);assert.equal(usage.receipts[0].estimated_usd,null);
  // Existing installations may contain zero allowances; those must no longer block use.
  db.exec('CREATE TABLE IF NOT EXISTS ai_limits(user_id TEXT PRIMARY KEY,gemini INTEGER,elevenlabs INTEGER,characters INTEGER)');
  db.prepare('INSERT INTO ai_limits VALUES(?,0,0,0)').run(a.data.user.id);
  badCitation=false;
  const before=requests.length;
  for(let i=0;i<12;i++){
   const p3=await req('/briefs/preview','POST',{recordIds:[id]},a.cookie);
   assert.equal((await req('/briefs/generate','POST',{previewId:p3.data.id,confirmed:true},a.cookie)).status,200);
  }
  assert.equal((await req('/speech','POST',{text:'Hello'},a.cookie)).status,200);
  assert.equal(requests.length,before+13);
  usage=(await req('/usage','GET',undefined,a.cookie)).data;
  assert.equal(usage.receipts.length,15);assert.equal('limits' in usage,false);
  assert.equal((await req('/analytics/sync','POST',{},a.cookie)).status,400);assert.equal(queries.length,0);
  const sync=await req('/analytics/sync','POST',{confirmed:true},a.cookie);assert.equal(sync.status,200);assert.equal(sync.data.readings,1);
  const insert=queries.find(q=>q.sql.startsWith('INSERT INTO pulse_measurements'));assert.ok(insert);assert.ok(!insert.params[0].includes('PRIVATE NOTE'));assert.ok(!insert.params[0].includes('private@example.com'));
  assert.equal((await req('/analytics/daily','GET',undefined,a.cookie)).data.engine,'Tiger Data continuous aggregate');assert.equal((await req('/analytics/daily','GET',undefined,b.cookie)).data.engine,'not-synced');
  const daily=queries.find(q=>q.sql.includes('FROM pulse_daily WHERE'));assert.equal(daily.params[0],a.data.user.id);
  failTiger=true;assert.equal((await req('/records/'+id,'DELETE',undefined,a.cookie)).status,503);assert.equal((await req('/records','GET',undefined,a.cookie)).data.records.length,1);
  failTiger=false;assert.equal((await req('/records/'+id,'DELETE',undefined,a.cookie)).status,200);
  assert.ok(queries.some(q=>q.sql.includes('AND record_id=$2')&&q.params[1]===id));
  assert.equal((await req('/analytics/snapshot','DELETE',undefined,a.cookie)).status,200);
  assert.equal((await req('/briefs/'+brief.id,'DELETE',undefined,a.cookie)).status,200);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});for(const [key,v] of [['GEMINI_API_KEY',prior.gemini],['ELEVENLABS_API_KEY',prior.voice]])if(v===undefined)delete process.env[key];else process.env[key]=v;}
});
