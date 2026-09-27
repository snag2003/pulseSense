import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const commands=[['python3',['-m','venv','vision/.venv']],['vision/.venv/bin/python',['-m','pip','install','-r','vision/requirements.txt']],['vision/.venv/bin/python',['vision/setup.py']]];
for(const [command,args] of commands){const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error||r.status!==0){console.error('Vision setup did not complete. Use Python 3.11 or 3.12 and check VISION.md.');process.exit(1);}}
console.log('Vision is installed. Restart the PulseSense server.');
