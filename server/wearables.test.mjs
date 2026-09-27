import {grantedOuraScopes} from './wearables.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './app.mjs';

test('wearables: OAuth binding, encrypted renewal, pagination, ownership, deduplication, scoped Apple pairing and revocation', async()=>{
 const root=mkdtempSync(join(tmpdir(),'pulse-wearables-'));
 const prior={};for(const key of ['OURA_CLIENT_ID','OURA_CLIENT_SECRET','OURA_REDIRECT_URI']){prior[key]=process.env[key];process.env[key]=key==='OURA_REDIRECT_URI'?'http://localhost:5173/api/wearables/oura/callback':'test-'+key;}
 let refreshes=0,requests=0,failPage=false;
 const timestamp=new Date(Date.now()-3600000).toISOString(),day=timestamp.slice(0,10);
 const providerFetch=async(url,options)=>{
  requests++;
  if(url.endsWith('/oauth/token')){if(options.body.get('grant_type')==='refresh_token')refreshes++;return Response.json({scope:'extapi:heartrate extapi:daily extapi:spo2',access_token:'secret-access',refresh_token:'secret-refresh-'+refreshes,expires_in:refreshes?3600:1});}
  const u=new URL(url);
  assert.equal(options.headers.Authorization,'Bearer secret-access');
  if(u.pathname.endsWith('/heartrate')){
   if(u.searchParams.has('next_token')) {if(failPage)return new Response('',{status:500});return Response.json({data:[{timestamp,bpm:73,source:'rest'}],next_token:null});}
   return Response.json({data:[{timestamp,bpm:72,source:'awake'}],next_token:'page-2'});
  }
  if(u.pathname.endsWith('/sleep'))return Response.json({data:[{id:'sleep-1',bedtime_end:timestamp,average_hrv:42,average_breath:15}],next_token:null});
  if(u.pathname.endsWith('/daily_spo2'))return Response.json({data:[{id:'oxygen-1',day,spo2_percentage:{average:98}},{id:'missing',day,spo2_percentage:null}],next_token:null});
  throw new Error('Unexpected provider URL');
 };
 const {app,db}=createApp({databasePath:join(root,'test.sqlite'),providerFetch});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 const request=async(path,method='GET',body,cookie='',token)=>{
  const response=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-PulseSense-Request':'1',Cookie:cookie,...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():null,cookie:response.headers.get('set-cookie')?.split(';')[0],location:response.headers.get('location')};
 };
 try{
  const a=await request('/auth/register','POST',{email:'watch@example.com',name:'Watch Test',password:'test-password-long'});
  const b=await request('/auth/register','POST',{email:'other@example.com',name:'Other Test',password:'test-password-long'});
  assert.equal((await request('/wearables')).status,401);
  assert.equal((await request('/wearables','GET',undefined,a.cookie)).data.oura.configured,true);
  const validCallback=process.env.OURA_REDIRECT_URI;
  process.env.OURA_REDIRECT_URI='[http://localhost:5173/api/wearables/oura/callback]';
  const malformed=await request('/wearables/oura/connect','POST',{},a.cookie);
  assert.equal(malformed.status,503);assert.match(malformed.data.error,/without brackets/);
  process.env.OURA_REDIRECT_URI='https://cloud.ouraring.com/oauth/authorize?client_id=example';
  assert.equal((await request('/wearables/oura/connect','POST',{},a.cookie)).status,503);
  process.env.OURA_REDIRECT_URI=validCallback;
  const connect=await request('/wearables/oura/connect','POST',{},a.cookie),state=new URL(connect.data.url).searchParams.get('state');
  assert.equal((await request('/wearables/oura/callback?state='+state+'&code=test&scope=heartrate%20daily%20spo2')).status,400);
  assert.equal(requests,0);
  const callback=await request('/wearables/oura/callback?state='+state+'&code=test','GET',undefined,connect.cookie);
  assert.equal(callback.status,302);assert.match(callback.location,/result=connected/);
  assert.equal((await request('/wearables/oura/callback?state='+state+'&code=test','GET',undefined,connect.cookie)).status,400);
  const stored=db.prepare("SELECT secret FROM wearable_links WHERE provider='oura'").get().secret;assert.ok(!stored.includes('secret-access'));
  assert.equal(readFileSync(join(root,'.wearable-key')).length,32);
  assert.equal((await request('/wearables/oura/sync','POST',{},b.cookie)).status,409);
  const sync=await request('/wearables/oura/sync','POST',{},a.cookie);assert.equal(sync.status,200,JSON.stringify(sync.data));assert.equal(sync.data.inserted,4);assert.equal(refreshes,1);
  assert.equal((await request('/wearables/oura/sync','POST',{},a.cookie)).data.inserted,0);
  const records=(await request('/records','GET',undefined,a.cookie)).data.records;assert.equal(records.length,4);assert.ok(records.every(r=>r.payload.source==='oura'));assert.ok(records.some(r=>r.payload.hrvMethod==='RMSSD'));assert.ok(records.some(r=>r.payload.measurementDay===day));
  assert.equal((await request('/records','GET',undefined,b.cookie)).data.records.length,0);
  failPage=true;assert.equal((await request('/wearables/oura/sync','POST',{},a.cookie)).status,502);assert.equal((await request('/records','GET',undefined,a.cookie)).data.records.length,4);
  const code=await request('/wearables/apple/pair-code','POST',{},a.cookie);
  const pair=await request('/wearables/apple/pair','POST',{code:code.data.code});assert.equal(pair.status,200);assert.equal((await request('/wearables/apple/pair','POST',{code:code.data.code})).status,401);
  assert.equal((await request('/records','GET',undefined,'',pair.data.token)).status,401,'device token must not access general account data');
  const sample={id:'12345678-1234-1234-1234-123456789012',metric:'hrv',value:54,measuredAt:timestamp,hrvMethod:'SDNN'};
  assert.equal((await request('/wearables/apple/import','POST',{samples:[{...sample,hrvMethod:'RMSSD'}]},'',pair.data.token)).status,400);
  const imported=await request('/wearables/apple/import','POST',{samples:[sample]},'',pair.data.token);assert.equal(imported.status,200);assert.equal(imported.data.inserted,1);
  assert.equal((await request('/wearables/apple/import','POST',{samples:[sample]},'',pair.data.token)).data.inserted,0);
  const apple=(await request('/records','GET',undefined,a.cookie)).data.records.find(r=>r.payload.source==='apple-health');assert.equal(apple.payload.hrvMethod,'SDNN');
  await request('/records/'+apple.id,'DELETE',undefined,a.cookie);
  assert.equal((await request('/wearables/apple/import','POST',{samples:[sample]},'',pair.data.token)).data.inserted,0,'deleted readings must not be resurrected');
  await request('/wearables/apple-health','DELETE',{},b.cookie);assert.equal((await request('/wearables/apple/import','POST',{samples:[sample]},'',pair.data.token)).status,200,'other user cannot revoke this token');
  await request('/wearables/apple-health','DELETE',{},a.cookie);assert.equal((await request('/wearables/apple/import','POST',{samples:[sample]},'',pair.data.token)).status,401);
  await request('/wearables/oura','DELETE',{},a.cookie);assert.equal((await request('/wearables','GET',undefined,a.cookie)).data.oura.connected,false);assert.equal((await request('/records','GET',undefined,a.cookie)).data.records.length,4);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(root,{recursive:true,force:true});for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('Oura scopes: token response first, legacy fallback, no implicit grants',()=>{
 assert.deepEqual(grantedOuraScopes({scope:'extapi:heartrate extapi:daily extapi:spo2'},undefined),['heartrate','daily','spo2']);
 assert.deepEqual(grantedOuraScopes({scope:'heartrate'},'daily spo2'),['heartrate']);
 assert.deepEqual(grantedOuraScopes({},'daily spo2'),['daily','spo2']);
 assert.deepEqual(grantedOuraScopes({scope:''},'daily'),[]);
 assert.deepEqual(grantedOuraScopes({},undefined),[]);
 assert.deepEqual(grantedOuraScopes({scope:['extapi:daily','email','extapi:daily',null]},undefined),['daily']);
});
