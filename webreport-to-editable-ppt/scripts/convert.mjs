#!/usr/bin/env node
// A local, reproducible workflow. Requires the host's presentation runtime.
import path from 'node:path';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const argv=process.argv.slice(2),input=argv[0],get=(flag,fallback)=>argv.includes(flag)?argv[argv.indexOf(flag)+1]:fallback;
if(argv.includes('--help')){console.log('Usage: convert.mjs INPUT.html --output OUTPUT.pptx [--pages 1,4,7] [--work WORK_DIR] [--selector section.slide]');process.exit(0);}
const output=get('--output'),work=get('--work',path.join(process.cwd(),'work','webreport-conversion-'+Date.now())),pages=get('--pages'),selector=get('--selector','section.slide');
if(!input||!output)throw Error('Usage: convert.mjs INPUT.html --output OUTPUT.pptx [--pages 1,4,7] [--work WORK_DIR] [--selector section.slide]');
for(const k of ['RUNTIME_NODE_MODULES','RUNTIME_PYTHON','PRESENTATIONS_SKILL'])if(!process.env[k])throw Error('Missing '+k+'; read references/runtime.md');
try{await fs.access(output);throw Error('Output already exists; select a new filename');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(work,{recursive:true});await fs.mkdir(path.dirname(output),{recursive:true});
const here=path.dirname(fileURLToPath(import.meta.url));
async function run(exe,args){await new Promise((resolve,reject)=>{const cp=spawn(exe,args,{stdio:'inherit',env:process.env});cp.on('error',reject);cp.on('exit',n=>n===0?resolve():reject(Error(path.basename(args[0])+' exited '+n)));});}
await run(process.execPath,[path.join(here,'extract_webreport.mjs'),input,work,'--selector',selector,...(pages?['--pages',pages]:[])]);
const manifest=path.join(work,'manifest.json'),draft=path.join(work,'draft.pptx'),native=path.join(work,'native.pptx');
await run(process.execPath,[path.join(here,'build_pptx.mjs'),manifest,draft]);
await run(process.env.RUNTIME_PYTHON,[path.join(here,'polish_pptx.py'),draft,manifest,native]);
await run(process.execPath,[path.join(here,'finalize.mjs'),native,output,manifest]);
await run(process.env.RUNTIME_PYTHON,[path.join(here,'audit_conversion.py'),manifest,output,'--report',path.join(work,'conversion-audit.json')]);
await run(process.execPath,[path.join(here,'render_pptx.mjs'),output,path.join(work,'final-render')]);
console.log('Conversion complete. Inspect source and final previews in '+path.resolve(work));
