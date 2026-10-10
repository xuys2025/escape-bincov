/** Replays the original legal bag target (5,0), retaining the final stability wait and all H16 assertions. */
import {readFile,writeFile,unlink,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const main=await readFile('scripts/station-browser-test.mjs','utf8');
const anchor="await cellCenter('bag',4,2)";
if(main.split(anchor).length!==2)throw Error('original target anchor changed');
const temp=resolve('scripts/.sol-original-target-probe.mjs');
if(!temp.startsWith(resolve('scripts')+'/')&&!temp.startsWith(resolve('scripts')+'\\'))throw Error('unexpected temporary path');
try {await access(temp);throw Error('temporary script already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
try {
  await writeFile(temp,main.replace(anchor,"await cellCenter('bag',5,0)"),{flag:'wx'});
  const child=spawnSync(process.execPath,['--import','tsx',temp,'--only=H16','--out=docs/station-yard/sol-acceptance-20261010/evidence/original-target-control'],{stdio:'inherit'});
  if(child.error)throw child.error;
  process.exitCode=child.status??1;
}finally {await unlink(temp);}