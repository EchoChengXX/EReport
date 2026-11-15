#!/usr/bin/env node
import path from 'node:path';import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const [candidate,finalPath,manifestPath]=process.argv.slice(2);const sk=process.env.PRESENTATIONS_SKILL,py=process.env.RUNTIME_PYTHON;
if(!sk||!py||!manifestPath)throw Error('Set PRESENTATIONS_SKILL and RUNTIME_PYTHON; usage: finalize.mjs candidate.pptx output.pptx manifest.json');
const m=JSON.parse(await fs.readFile(manifestPath,'utf8')),size=m.slides[0];
const {finalizePresentation}=await import(pathToFileURL(path.join(sk,'container_tools/artifact_tool_utils.mjs')).href);
await finalizePresentation({workspaceDir:process.cwd(),candidatePath:path.resolve(candidate),finalPath:path.resolve(finalPath),pythonExecutable:py,integrityValidatorPath:path.join(sk,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(sk,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu',`${Math.round(size.width*9525)},${Math.round(size.height*9525)}`],explicitTotalSlideCount:m.slides.length,fontPolicy:{basis:'design',families:['微软雅黑']},verifyArtifactToolImport:true,receiptPath:path.resolve(path.dirname(candidate),'final-validation.json')});
