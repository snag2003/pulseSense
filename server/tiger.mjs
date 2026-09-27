import pg from 'pg';
import {readFileSync} from 'node:fs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createTiger({app,db,audit,tigerPool}) {
 db.exec('CREATE TABLE IF NOT EXISTS tiger_sync(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,last_sync TEXT,readings INTEGER,rollup_ready INTEGER DEFAULT 0)');
 let pool=tigerPool;
 function getPool(){
  if(pool)return pool;
  if(!process.env.TIGER_DATABASE_URL)throw fail(503,'Add TIGER_DATABASE_URL to the server .env and run npm run tiger:migrate.');
  const url=new URL(process.env.TIGER_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
  pool=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true,...(process.env.TIGER_CA_FILE?{ca:readFileSync(process.env.TIGER_CA_FILE,'utf8')}:{})},max:3,connectionTimeoutMillis:10000,statement_timeout:30000});
  pool.on('error',()=>{});return pool;
 }
 const configured=()=>!!(tigerPool||process.env.TIGER_DATABASE_URL);
 const locks=new Set();
 const acquire=id=>{if(locks.has(id))throw fail(409,'An analytics operation is already running.');locks.add(id);};
 async function refresh(){await getPool().query("CALL refresh_continuous_aggregate('pulse_daily', NULL, NULL)");}
 async function removeRecord(user,id){
  if(locks.has(user))throw fail(409,'An analytics sync is running. Retry deletion once it finishes.');
  if(!db.prepare('SELECT user_id FROM tiger_sync WHERE user_id=?').get(user))return;
  acquire(user);try{await getPool().query('DELETE FROM pulse_measurements WHERE user_id=$1 AND record_id=$2',[user,id]);db.prepare('UPDATE tiger_sync SET rollup_ready=0 WHERE user_id=?').run(user);try{await refresh();db.prepare('UPDATE tiger_sync SET rollup_ready=1 WHERE user_id=?').run(user);}catch{/* Queries fall back to current raw data, never stale rollups. */}}catch{throw fail(503,'Could not remove the Tiger Data copy. Try again when analytics is available. The local record has not been deleted.');}finally{locks.delete(user);}
 }
 app.get('/api/analytics/status',(req,res)=>res.json({configured:configured(),snapshot:db.prepare('SELECT last_sync,readings,rollup_ready FROM tiger_sync WHERE user_id=?').get(req.user.id)||null}));
 app.post('/api/analytics/sync',async(req,res)=>{
  if(req.body.confirmed!==true)throw fail(400,'Approve sending your measurement snapshot to Tiger Data first.');
  const user=req.user.id;acquire(user);let client;
  try{
   const records=db.prepare("SELECT id,payload,created FROM records WHERE user_id=? AND kind='vitals'").all(user);
   if(records.length>50000)throw fail(400,'This demo sync supports up to 50,000 reading records.');
   const rows=[];for(const r of records){const p=JSON.parse(r.payload);for(const metric of ['hr','hrv','spo2','rr','sbp','dbp'])if(typeof p[metric]==='number'&&Number.isFinite(p[metric]))rows.push({user_id:user,record_id:r.id,measured_at:p.measuredAt||r.created,source:p.source||'manual',metric,method:metric==='hrv'?(p.hrvMethod||'unspecified'):'',aggregation:p.measurement||'Manual reading',value:p[metric]});}
   client=await getPool().connect();await client.query('BEGIN');
   await client.query('DELETE FROM pulse_measurements WHERE user_id=$1',[user]);
   for(let i=0;i<rows.length;i+=1000)await client.query(`INSERT INTO pulse_measurements SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(user_id text,record_id text,measured_at timestamptz,source text,metric text,method text,aggregation text,value double precision)`,[JSON.stringify(rows.slice(i,i+1000))]);
   await client.query('COMMIT');
   const now=new Date().toISOString();db.prepare('INSERT OR REPLACE INTO tiger_sync VALUES(?,?,?,?)').run(user,now,rows.length,0);
   let ready=false;try{await refresh();ready=true;db.prepare('UPDATE tiger_sync SET rollup_ready=1 WHERE user_id=?').run(user);}catch{}
   audit(user,'Measurement snapshot synced to Tiger Data');res.json({readings:rows.length,lastSync:now,rollupReady:ready});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(e.status)throw e;throw fail(503,'Tiger Data sync failed. Check the connection string, network access, and migration.');}finally{client?.release();locks.delete(user);}
 });
 app.get('/api/analytics/daily',async(req,res)=>{
  const user=req.user.id,info=db.prepare('SELECT * FROM tiger_sync WHERE user_id=?').get(user);if(!info)return res.json({rows:[],engine:'not-synced'});
  const begin=performance.now();
  try{
   const sql=info.rollup_ready?`SELECT day,source,metric,method,aggregation,samples,average,minimum,maximum FROM pulse_daily WHERE user_id=$1 AND day>=now()-interval '30 days' ORDER BY day DESC LIMIT 1000`:`SELECT time_bucket(interval '1 day',measured_at) AS day,source,metric,method,aggregation,count(*) AS samples,avg(value) AS average,min(value) AS minimum,max(value) AS maximum FROM pulse_measurements WHERE user_id=$1 AND measured_at>=now()-interval '30 days' GROUP BY day,source,metric,method,aggregation ORDER BY day DESC LIMIT 1000`;
   const result=await getPool().query(sql,[user]);res.json({rows:result.rows,engine:info.rollup_ready?'Tiger Data continuous aggregate':'Tiger Data live SQL',queryMs:Math.round((performance.now()-begin)*10)/10,lastSync:info.last_sync});
  }catch{throw fail(503,'Analytics is unavailable. Your local journal is still available.');}
 });
 app.delete('/api/analytics/snapshot',async(req,res)=>{
  const user=req.user.id;acquire(user);try{await getPool().query('DELETE FROM pulse_measurements WHERE user_id=$1',[user]);db.prepare('UPDATE tiger_sync SET rollup_ready=0 WHERE user_id=?').run(user);await refresh();db.prepare('DELETE FROM tiger_sync WHERE user_id=?').run(user);audit(user,'Tiger Data snapshot removed');res.json({ok:true});}catch{throw fail(503,'Snapshot removal did not fully complete. Retry to clear both raw and aggregate copies.');}finally{locks.delete(user);}
 });
 return {removeRecord,close:()=>pool?.end()};
}
