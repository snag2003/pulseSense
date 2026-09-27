import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './app.mjs';
test('vision consent, private photos, one-use scan saving and AI sharing',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pulse-vision-')),calls=[],providerCalls=[];
 const original=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';
 const fakeImage='data:image/jpeg;base64,/9j/';
 const {app,db}=createApp({databasePath:join(dir,'db'),visionWorker:async input=>{calls.push(input);return input.action==='scan'?{accepted:true,bpm:72,quality:{fps:15},waveform:[0,1,0,-1]}:{overlay:fakeImage,areaPercent:10,areaPixels:1000};},providerFetch:async(url,options)=>{providerCalls.push(JSON.parse(options.body));return Response.json({candidates:[{content:{parts:[{text:'Visible observations with uncertainty.'}]}}]});}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-PulseSense-Request':'1',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const a=await req('/auth/register','POST',{email:'a@example.test',name:'A',password:'test-password-long'}),b=await req('/auth/register','POST',{email:'b@example.test',name:'B',password:'test-password-long'});
  const frames=Array.from({length:301},(_,i)=>({t:i/10,image:fakeImage}));
  assert.equal((await req('/vision/scan','POST',{frames},a.cookie)).status,400);assert.equal(calls.length,0);
  const scan=await req('/vision/scan','POST',{frames,confirmed:true},a.cookie);assert.equal(scan.status,200);
  assert.equal((await req('/vision/scan/save','POST',{id:scan.data.id},b.cookie)).status,409);
  const saved=await req('/vision/scan/save','POST',{id:scan.data.id},a.cookie);assert.equal(saved.data.record.payload.source,'camera-rppg');assert.equal(saved.data.record.payload.hr,72);
  assert.equal((await req('/vision/scan/save','POST',{id:scan.data.id},a.cookie)).status,409);
  assert.equal((await req('/vision/photos','POST',{image:fakeImage,label:'Left arm'},a.cookie)).status,400);
  const photo=await req('/vision/photos','POST',{confirmed:true,image:fakeImage,label:'Left arm',note:'Example',box:[.2,.2,.5,.5]},a.cookie);assert.equal(photo.status,200);const id=photo.data.entry.id;
  assert.equal((await req('/vision/photos/'+id,'GET',undefined,b.cookie)).status,404);
  assert.equal((await req('/vision/photos','GET',undefined,b.cookie)).data.entries.length,0);
  assert.equal((await req('/vision/photos/'+id+'/analyze','POST',{confirmed:true},a.cookie)).status,403);assert.equal(providerCalls.length,0);
  await req('/preferences','PATCH',{ai:true,voice:false},a.cookie);
  assert.equal((await req('/vision/photos/'+id+'/analyze','POST',{confirmed:false},a.cookie)).status,403);
  assert.equal((await req('/vision/photos/'+id+'/analyze','POST',{confirmed:true},a.cookie)).status,200);assert.equal(providerCalls.length,1);
  assert.equal(providerCalls[0].contents[0].parts.filter(p=>p.inline_data).length,1);
  assert.equal((await req('/vision/photos/'+id,'DELETE',undefined,b.cookie)).status,404);
  assert.equal((await req('/vision/photos/'+id,'DELETE',undefined,a.cookie)).status,200);
  assert.equal((await req('/vision/photos/'+id,'GET',undefined,a.cookie)).status,404);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
});
