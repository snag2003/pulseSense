import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
test('loads project .env outside working directory and never prints secrets', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = mkdtempSync(resolve(root, '.config-test-'));
  try {
    mkdirSync(resolve(fixture,'server'));
    for (const file of ['config.mjs','check-config.mjs']) copyFileSync(resolve(root,'server',file),resolve(fixture,'server',file));
    const env = {...process.env};
    delete env.GEMINI_API_KEY; delete env.ELEVENLABS_API_KEY;
    writeFileSync(resolve(fixture,'.env'), 'GEMINI_API_KEY=fixture-google-secret\nELEVENLABS_API_KEY=fixture-voice-secret\n');
    const result = spawnSync(process.execPath,[resolve(fixture,'server/check-config.mjs')],{cwd:'/private/tmp',env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Gemini key: loaded/);
    assert.match(result.stdout,/ElevenLabs key: loaded/);
    assert.ok(!result.stdout.includes('fixture-google-secret'));
    assert.ok(!result.stdout.includes('fixture-voice-secret'));
  } finally {rmSync(fixture,{recursive:true,force:true});}
});
