import './config.mjs';
import pg from 'pg';
import {readFileSync} from 'node:fs';
if(!process.env.TIGER_DATABASE_URL)throw new Error('TIGER_DATABASE_URL is missing. Add it to .env; do not paste it into chat.');
const url=new URL(process.env.TIGER_DATABASE_URL);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const client=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true,...(process.env.TIGER_CA_FILE?{ca:readFileSync(process.env.TIGER_CA_FILE,'utf8')}:{})},connectionTimeoutMillis:10000});
try{await client.connect();await client.query(readFileSync(new URL('../sql/tiger.sql',import.meta.url),'utf8'));console.log('Tiger Data hypertable and daily continuous aggregate created. No health records uploaded.');}catch{console.error('Migration failed. Check the Tiger connection, trusted CA, permissions, and TimescaleDB support.');process.exitCode=1;}finally{await client.end();}
