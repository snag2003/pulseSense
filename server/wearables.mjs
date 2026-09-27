import { Router } from 'express';
import { randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
const error = (status, message) => Object.assign(new Error(message), {status});
const iso = value => { const n=Date.parse(value); if(typeof value!=='string'||!Number.isFinite(n)||n>Date.now()+300000||n<Date.UTC(2000,0,1)) throw error(400,'Invalid measurement time.'); return new Date(n).toISOString(); };
const ranges={hr:[20,250],hrv:[0,500],spo2:[50,100],rr:[3,80]};

export function grantedOuraScopes(tokens, callbackScope) {
  // The provider token response is authoritative when it supplies scope.
  const raw = tokens.scope !== undefined ? tokens.scope : callbackScope;
  const values = typeof raw === 'string' ? raw.split(/\s+/) : Array.isArray(raw) ? raw : [];
  return [...new Set(values.filter(v => typeof v === 'string').map(v => v.replace(/^extapi:/, '')).filter(v => ['heartrate','daily','spo2'].includes(v)))];
}

export function createWearables({db,databasePath,providerFetch,audit,limit}) {
  db.exec(`CREATE TABLE IF NOT EXISTS wearable_links(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,provider TEXT,version TEXT NOT NULL,secret TEXT,expires INTEGER,scopes TEXT,last_sync TEXT,PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS wearable_states(state TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,browser TEXT,expires INTEGER);
    CREATE TABLE IF NOT EXISTS wearable_pairings(code TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER);
    CREATE TABLE IF NOT EXISTS wearable_imports(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,provider TEXT,external_id TEXT,record_id TEXT,PRIMARY KEY(user_id,provider,external_id));`);
  // Persist a separate encryption key; never serialize provider tokens to the browser.
  const keyPath=resolve(dirname(databasePath),'.wearable-key');
  let key;
  try{key=readFileSync(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);writeFileSync(keyPath,key,{mode:0o600,flag:'wx'});}
  if(key.length!==32)throw new Error('Wearable encryption key must contain 32 bytes.');
  function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
  function unseal(value){const b=Buffer.from(value,'base64'),dec=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));dec.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString());}
  const link=(id,provider)=>db.prepare('SELECT * FROM wearable_links WHERE user_id=? AND provider=?').get(id,provider);
  const validLink=(id,provider,version)=>link(id,provider)?.version===version;
  const configured=()=>!!(process.env.OURA_CLIENT_ID&&process.env.OURA_CLIENT_SECRET&&process.env.OURA_REDIRECT_URI);
  const origin=()=>process.env.APP_ORIGIN||'http://localhost:5173';
  const secure=()=>process.env.NODE_ENV==='production';
  const cookieOptions=()=>({httpOnly:true,sameSite:'lax',secure:secure(),path:'/api/wearables/oura/callback',maxAge:600000});
  const publicRouter=Router(), privateRouter=Router();
  const inflight=new Set();
  const busy=(id)=>{if(inflight.has(id))throw error(409,'A wearable sync is already running.');inflight.add(id);};
  function persist(user,provider,version,items){
    if(!validLink(user,provider,version))throw error(409,'Connection changed. No readings were imported.');
    let inserted=0,updated=0;
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const item of items){
        const old=db.prepare('SELECT record_id FROM wearable_imports WHERE user_id=? AND provider=? AND external_id=?').get(user,provider,item.externalId);
        const payload=JSON.stringify({...item.payload,source:provider,measuredAt:item.measuredAt});
        if(old){
          // A removed entry stays removed on future syncs. Provider revisions update existing entries.
          const r=db.prepare('UPDATE records SET payload=? WHERE id=? AND user_id=? AND payload<>?').run(payload,old.record_id,user,payload);updated+=Number(r.changes);continue;
        }
        const id=randomUUID();db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(id,user,'vitals',payload,new Date().toISOString());
        db.prepare('INSERT INTO wearable_imports VALUES(?,?,?,?)').run(user,provider,item.externalId,id);inserted++;
      }
      db.prepare('UPDATE wearable_links SET last_sync=? WHERE user_id=? AND provider=? AND version=?').run(new Date().toISOString(),user,provider,version);
      audit(user,`${provider==='oura'?'Oura':'Apple Health'} synced: ${inserted} new readings`);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return {inserted,updated};
  }
  async function tokenRequest(body){
    const response=await providerFetch('https://api.ouraring.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:process.env.OURA_CLIENT_ID,client_secret:process.env.OURA_CLIENT_SECRET}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw error(502,'Oura authorization failed. Reconnect your ring and check its app configuration.');
    const value=await response.json();
    if(typeof value.access_token!=='string'||typeof value.refresh_token!=='string'||!Number.isFinite(value.expires_in)||value.expires_in<=0)throw error(502,'Oura returned an invalid token response.');
    return value;
  }
  privateRouter.get('/wearables',(req,res)=>{
    const oura=link(req.user.id,'oura'),apple=link(req.user.id,'apple-health');
    res.json({oura:{configured:configured(),connected:!!oura,lastSync:oura?.last_sync||null,scopes:oura?.scopes?.split(' ')||[]},apple:{connected:!!apple&&apple.expires>Date.now(),lastSync:apple?.last_sync||null,expires:apple?.expires||null}});
  });
  privateRouter.post('/wearables/oura/connect',(req,res)=>{
    limit(`oura-connect:${req.user.id}`,10,60000);
    if(!configured())throw error(503,'Add OURA_CLIENT_ID, OURA_CLIENT_SECRET, and OURA_REDIRECT_URI to the server .env, then restart.');
    let redirect;
    try { redirect=new URL(process.env.OURA_REDIRECT_URI); } catch { throw error(503,'OURA_REDIRECT_URI must be a plain callback URL without brackets. For local development use http://localhost:5173/api/wearables/oura/callback, then restart the server.'); }
    if(!['http:','https:'].includes(redirect.protocol)||redirect.pathname!=='/api/wearables/oura/callback'||redirect.search||redirect.hash||redirect.username||redirect.password)throw error(503,'OURA_REDIRECT_URI must point to /api/wearables/oura/callback, without query parameters. Use the callback URL, not the Oura authorization link.');
    if(secure()&&redirect.protocol!=='https:')throw error(503,'Oura requires an HTTPS callback in production.');
    const state=randomBytes(32).toString('hex'),browser=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM wearable_states WHERE expires<? OR user_id=?').run(Date.now(),req.user.id);
    db.prepare('INSERT INTO wearable_states VALUES(?,?,?,?)').run(hash(state),req.user.id,hash(browser),Date.now()+600000);
    res.cookie('pulse_oura_state',browser,cookieOptions());
    const url=new URL('https://cloud.ouraring.com/oauth/authorize');url.search=new URLSearchParams({response_type:'code',client_id:process.env.OURA_CLIENT_ID,redirect_uri:redirect.href,scope:'heartrate daily spo2',state}).toString();
    res.json({url:url.href});
  });
  // OAuth callback does not rely on the Strict session cookie, which is withheld cross-site.
  publicRouter.get('/wearables/oura/callback',async(req,res)=>{
    const state=typeof req.query.state==='string'?req.query.state:'',browser=req.cookies.pulse_oura_state;
    const pending=db.prepare('SELECT * FROM wearable_states WHERE state=?').get(hash(state));
    if(!pending||pending.expires<Date.now()||typeof browser!=='string'||hash(browser)!==pending.browser)throw error(400,'Oura connection expired or could not be verified. Start again in Wearables.');
    res.clearCookie('pulse_oura_state',{path:cookieOptions().path});
    // Reserve this state while exchanging the code. Disconnect can still cancel it.
    db.prepare('UPDATE wearable_states SET browser=? WHERE state=?').run('used',hash(state));
    if(req.query.error){db.prepare('DELETE FROM wearable_states WHERE state=?').run(hash(state));return res.redirect(origin()+'/?wearable=oura&result=cancelled');}
    try{
      if(typeof req.query.code!=='string'||req.query.code.length>2048)throw error(400,'Missing Oura authorization code.');
      const tokens=await tokenRequest({grant_type:'authorization_code',code:req.query.code,redirect_uri:process.env.OURA_REDIRECT_URI});
      if(!db.prepare('SELECT state FROM wearable_states WHERE state=?').get(hash(state)))throw error(409,'Oura connection was cancelled.');
      const scopes=grantedOuraScopes(tokens,req.query.scope);
      if(!scopes.length)throw error(400,'Oura returned no supported reading permissions. Start a new connection from Wearables and enable heart rate, sleep, or SpO2 access.');
      db.prepare('INSERT OR REPLACE INTO wearable_links VALUES(?,?,?,?,?,?,?)').run(pending.user_id,'oura',randomUUID(),seal(tokens),Date.now()+tokens.expires_in*1000,scopes.join(' '),null);
      audit(pending.user_id,'Oura connected');res.redirect(origin()+'/?wearable=oura&result=connected');
    }finally{db.prepare('DELETE FROM wearable_states WHERE state=?').run(hash(state));}
  });
  async function collect(endpoint,params,token){
    let next;const rows=[],seen=new Set();
    do{
      const url=new URL('https://api.ouraring.com/v2/usercollection/'+endpoint);url.search=new URLSearchParams({...params,...(next?{next_token:next}:{})}).toString();
      const response=await providerFetch(url.href,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw error(response.status===429?429:502,response.status===401?'Oura access expired. Reconnect your ring.':response.status===403?'Oura did not grant access to this reading type. Reconnect and review permissions.':response.status===429?'Oura is busy. Try syncing again later.':'Oura sync failed. No partial readings were saved.');
      const data=await response.json();if(!Array.isArray(data.data))throw error(502,'Unexpected Oura response.');rows.push(...data.data);next=data.next_token;
      if(next){if(typeof next!=='string'||seen.has(next)||seen.size>=100)throw error(502,'Oura pagination could not complete. No readings saved.');seen.add(next);}
    }while(next);
    return rows;
  }
  privateRouter.post('/wearables/oura/sync',async(req,res)=>{
    limit(`oura-sync:${req.user.id}`,3,60000);const id=req.user.id;busy(id);
    try{
      const current=link(id,'oura');if(!current)throw error(409,'Connect your Oura account first.');
      let tokens=unseal(current.secret);
      if(current.expires<Date.now()+60000){
        tokens=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token});
        if(!validLink(id,'oura',current.version))throw error(409,'Oura was disconnected.');
        db.prepare('UPDATE wearable_links SET secret=?,expires=? WHERE user_id=? AND provider=? AND version=?').run(seal(tokens),Date.now()+tokens.expires_in*1000,id,'oura',current.version);
      }
      const end=new Date(),start=new Date(Date.now()-7*86400000),scopes=current.scopes.split(' '),items=[];
      const add=(externalId,time,payload)=>{try{const measuredAt=iso(time);const filtered=Object.fromEntries(Object.entries(payload).filter(([k,v])=>!ranges[k]||(typeof v==='number'&&Number.isFinite(v)&&v>=ranges[k][0]&&v<=ranges[k][1])));if(Object.keys(ranges).some(k=>k in filtered))items.push({externalId,measuredAt,payload:filtered});}catch{/* Omit invalid/missing provider measurements, never fabricate zeros. */}};
      if(scopes.includes('heartrate'))for(const r of await collect('heartrate',{start_datetime:start.toISOString(),end_datetime:end.toISOString()},tokens.access_token))add(`hr:${r.timestamp}:${r.source}`,r.timestamp,{hr:r.bpm,measurement:'Heart rate sample',device:'Oura Ring'});
      const dates={start_date:start.toISOString().slice(0,10),end_date:end.toISOString().slice(0,10)};
      if(scopes.includes('daily'))for(const r of await collect('sleep',dates,tokens.access_token))if(r.id)add(`sleep:${r.id}`,r.bedtime_end,{hrv:r.average_hrv,rr:r.average_breath,hrvMethod:'RMSSD',measurement:'Sleep averages',device:'Oura Ring'});
      if(scopes.includes('spo2'))for(const r of await collect('daily_spo2',dates,tokens.access_token))if(r.id&&/^\d{4}-\d{2}-\d{2}$/.test(r.day))add(`spo2:${r.id}`,r.day+'T00:00:00Z',{spo2:r.spo2_percentage?.average,measurement:'Nightly oxygen average',measurementDay:r.day,device:'Oura Ring'});
      res.json({...persist(id,'oura',current.version,items),lastSync:new Date().toISOString()});
    }finally{inflight.delete(id);}
  });
  privateRouter.post('/wearables/apple/pair-code',(req,res)=>{
    limit(`apple-code:${req.user.id}`,10,60000);
    const code=randomBytes(16).toString('hex'),expires=Date.now()+600000;
    db.prepare('DELETE FROM wearable_pairings WHERE expires<? OR user_id=?').run(Date.now(),req.user.id);
    db.prepare('INSERT INTO wearable_pairings VALUES(?,?,?)').run(hash(code),req.user.id,expires);
    res.json({code,expires});
  });
  publicRouter.post('/wearables/apple/pair',(req,res)=>{
    limit(`apple-pair:${req.ip}`,10,60000);
    const code=req.body?.code;if(typeof code!=='string'||code.length!==32)throw error(400,'Enter the pairing code from PulseSense.');
    const pending=db.prepare('SELECT * FROM wearable_pairings WHERE code=?').get(hash(code));
    if(!pending||pending.expires<Date.now())throw error(401,'Pairing code expired or already used. Generate a new code.');
    const token=randomBytes(32).toString('hex'),expires=Date.now()+90*86400000;
    db.prepare('DELETE FROM wearable_pairings WHERE code=?').run(hash(code));
    db.prepare('INSERT OR REPLACE INTO wearable_links VALUES(?,?,?,?,?,?,?)').run(pending.user_id,'apple-health',randomUUID(),hash(token),expires,'hr hrv spo2 rr',null);
    audit(pending.user_id,'Apple Health companion paired');res.json({token,expires});
  });
  publicRouter.post('/wearables/apple/import',(req,res)=>{
    limit(`apple-import-ip:${req.ip}`,120,60000);
    const token=req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const current=token?db.prepare("SELECT * FROM wearable_links WHERE provider='apple-health' AND secret=? AND expires>?").get(hash(token),Date.now()):null;
    if(!current)throw error(401,'Pair the companion again in PulseSense.');
    limit(`apple-import:${current.user_id}`,60,60000);
    const samples=req.body?.samples;
    if(!Array.isArray(samples)||!samples.length||samples.length>500)throw error(400,'Send between 1 and 500 readings.');
    const items=samples.map(s=>{
      if(!s||typeof s.id!=='string'||!/^[a-f0-9-]{36}$/i.test(s.id)||!Object.hasOwn(ranges,s.metric))throw error(400,'Invalid Apple Health sample.');
      const [lo,hi]=ranges[s.metric];if(typeof s.value!=='number'||!Number.isFinite(s.value)||s.value<lo||s.value>hi)throw error(400,'Invalid measurement value.');
      if(s.metric==='hrv'&&s.hrvMethod!=='SDNN')throw error(400,'Apple Health HRV must be labeled SDNN.');
      return {externalId:s.id,measuredAt:iso(s.measuredAt),payload:{[s.metric]:s.value,device:'Apple Watch',measurement:'Apple Health sample',...(s.metric==='hrv'?{hrvMethod:'SDNN'}:{})}};
    });
    res.json(persist(current.user_id,'apple-health',current.version,items));
  });
  privateRouter.delete('/wearables/:provider',(req,res)=>{
    const provider=req.params.provider;if(!['oura','apple-health'].includes(provider))throw error(400,'Unknown wearable.');
    db.prepare('DELETE FROM wearable_links WHERE user_id=? AND provider=?').run(req.user.id,provider);
    db.prepare('DELETE FROM wearable_states WHERE user_id=?').run(req.user.id);
    if(provider==='apple-health')db.prepare('DELETE FROM wearable_pairings WHERE user_id=?').run(req.user.id);
    audit(req.user.id,`${provider} disconnected`);
    res.json({ok:true,message:provider==='oura'?'Disconnected here. You can also revoke PulseSense in your Oura account settings. Saved readings remain.':'Companion access revoked. Saved readings remain.'});
  });
  return {publicRouter,privateRouter};
}
