import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const envPath = resolve(projectRoot, '.env');
config({ path: envPath, quiet: true });
for (const key of ['GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'GEMINI_MODEL', 'ELEVENLABS_VOICE_ID']) {
  if (process.env[key]) process.env[key] = process.env[key].trim();
}
if (process.env.DATABASE_PATH && !process.env.DATABASE_PATH.startsWith('/')) {
  process.env.DATABASE_PATH = resolve(projectRoot, process.env.DATABASE_PATH);
}
export function printConfiguration() {
  console.log(`Project folder: ${projectRoot}`);
  console.log(`Environment file: ${envPath} (${existsSync(envPath) ? 'found' : 'missing — copy .env.example to .env'})`);
  console.log(`Gemini key: ${process.env.GEMINI_API_KEY ? 'loaded' : 'missing'}`);
  console.log(`ElevenLabs key: ${process.env.ELEVENLABS_API_KEY ? 'loaded' : 'missing'}`);
  console.log('Loaded means present, not verified with the provider. Restart after changing .env.');
}
