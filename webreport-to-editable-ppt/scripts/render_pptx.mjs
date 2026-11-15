#!/usr/bin/env node
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';
const req=createRequire(path.join(process.env.RUNTIME_NODE_MODULES||process.cwd()+'/node_modules','package.json'));const {PresentationFile,FileBlob}=req('@oai/artifact-tool');
const [input,out]=process.argv.slice(2);if(!out)throw Error('Usage: render_pptx.mjs final.pptx preview-dir');const p=await PresentationFile.importPptx(await FileBlob.load(input));await fs.mkdir(out,{recursive:true});
for(let i=0;i<p.slides.items.length;i++){const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(out,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));console.log(`Rendered ${i+1}/${p.slides.items.length}`);}
