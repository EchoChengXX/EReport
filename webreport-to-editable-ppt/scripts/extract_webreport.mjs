#!/usr/bin/env node
// Extract a local HTML deck's actual computed DOM geometry. No source writes.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const args=process.argv.slice(2),input=args[0],out=args[1];if(!input||!out)throw Error('Usage: extract_webreport.mjs INPUT.html WORK_DIR [--selector section.slide]');
const req=createRequire(path.join(process.env.RUNTIME_NODE_MODULES||process.cwd()+'/node_modules','package.json'));
const {chromium}=req('playwright');const executablePath=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath});
try{
 await fs.mkdir(out,{recursive:true});const page=await browser.newPage({viewport:{width:1280,height:720}});
 // Local offline rendering: do not send content to remote services or execute remote resources.
 const blocked=[];await page.route(/https?:\/\//,r=>{blocked.push(r.request().url());return r.abort();});
 await page.goto(pathToFileURL(path.resolve(input)).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
 const selector=args.includes('--selector')?args[args.indexOf('--selector')+1]:'section.slide';
 const count=await page.locator(selector).count();if(!count)throw Error('No slides; specify --selector for the deck');
 let selected=Array.from({length:count},(_,i)=>i);
 if(args.includes('--pages')){selected=args[args.indexOf('--pages')+1].split(',').map(n=>Number(n)-1);if(selected.some(i=>!Number.isInteger(i)||i<0||i>=count)||new Set(selected).size!==selected.length)throw Error('Invalid or duplicate --pages values');}
 const slides=[];
 for(const i of selected){
  await page.evaluate(({selector,i})=>{
   document.querySelectorAll('.nav,.fs,.edit-toolbar,.progress,#editToast').forEach(e=>e.style.setProperty('display','none','important'));
   document.querySelectorAll(selector).forEach((e,k)=>{e.style.setProperty('display',k===i?'block':'none','important');e.style.setProperty('transform','none','important');e.style.setProperty('left','0','important');e.style.setProperty('top','0','important');});
  },{selector,i});
  const data=await page.evaluate(({selector,i})=>{
   const root=document.querySelectorAll(selector)[i],rr=root.getBoundingClientRect(),ops=[],warnings=[];let idx=0;
   const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left-rr.left,top:r.top-rr.top,width:r.width,height:r.height};};
   const style=e=>{const c=getComputedStyle(e);return {color:c.color,fontSize:parseFloat(c.fontSize),bold:parseFloat(c.fontWeight)>=600,italic:c.fontStyle==='italic',lineHeight:parseFloat(c.lineHeight)||parseFloat(c.fontSize)*1.2,align:c.textAlign,letterSpacing:c.letterSpacing,textGradient:c.backgroundClip==='text'?c.backgroundImage:null};};
   function visible(e){const c=getComputedStyle(e),r=e.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&Number(c.opacity)!==0&&r.width>0&&r.height>0;}
   function bg(e,id,pseudo){const c=getComputedStyle(e,pseudo||null);const r=rect(e);if(pseudo){r.left+=parseFloat(c.left)||0;r.top+=parseFloat(c.top)||0;r.width=parseFloat(c.width)||r.width;r.height=parseFloat(c.height)||r.height;}
    const fill=c.backgroundImage!=='none'?c.backgroundImage:c.backgroundColor;
    if(fill.includes('url('))warnings.push({id,kind:'unsupported-css-background-image'});
    const border=['Top','Right','Bottom','Left'].map(k=>({width:parseFloat(c['border'+k+'Width'])||0,color:c['border'+k+'Color'],style:c['border'+k+'Style']}));
    if(c.backgroundClip!=='text'&&(fill!=='rgba(0, 0, 0, 0)'||border.some(b=>b.width)))ops.push({type:'box',id,...r,fill,radius:parseFloat(c.borderTopLeftRadius)||0,border,opacity:parseFloat(c.opacity),pseudo});
    if(c.boxShadow!=='none')warnings.push({id,kind:'shadow-approximation'});
   }
   function text(e,id,nodes=null){
    const c=getComputedStyle(e);const content=nodes?nodes.map(n=>n.textContent).join(''):e.innerText;
    if(!content?.trim())return;
    const r=rect(e),range=document.createRange();if(nodes){range.setStartBefore(nodes[0]);range.setEndAfter(nodes.at(-1));}else range.selectNodeContents(e);
    const tr=range.getBoundingClientRect();if(!tr.width||!tr.height)return;
    const runs=[];const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){if(nodes&&!nodes.includes(node))continue;if(!node.textContent.trim())continue;const pe=node.parentElement;if(!visible(pe)||pe.closest('svg'))continue;runs.push({text:node.textContent.replace(/\s+/g,' '),...style(pe)});}
    // Record browser line breaks without splitting one paragraph into separate shapes.
    const chars=[];const lw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let tn;
    while(tn=lw.nextNode()){
     if(nodes&&!nodes.includes(tn))continue;if(!visible(tn.parentElement)||tn.parentElement.closest('svg'))continue;
     for(let off=0;off<tn.textContent.length;){const cp=String.fromCodePoint(tn.textContent.codePointAt(off));const rg=document.createRange();rg.setStart(tn,off);rg.setEnd(tn,off+cp.length);off+=cp.length;const cr=rg.getBoundingClientRect();if(cr.width<.01||cr.height<.01)continue;chars.push({char:/\s/.test(cp)?' ':cp,y:cr.top,x:cr.left});}
    }
    let layoutText='',lastY=null;
    for(const a of chars){if(lastY!==null&&Math.abs(a.y-lastY)>3){layoutText=layoutText.trimEnd()+'\n';}if(!(a.char===' '&&(!layoutText||/[ \n]$/.test(layoutText))))layoutText+=a.char;lastY=a.y;}
    layoutText=layoutText.trim();
    const pl=parseFloat(c.paddingLeft)||0,pr=parseFloat(c.paddingRight)||0,pt=parseFloat(c.paddingTop)||0,pb=parseFloat(c.paddingBottom)||0;
    // Use actual browser line placement; preserve full content width for wrapping.
    const horizontal=c.writingMode==='horizontal-tb';
    const box={left:r.left+pl,top:tr.top-rr.top-(style(e).lineHeight-style(e).fontSize)*.08,width:Math.max(r.width-pl-pr,tr.width),height:Math.max(tr.height,style(e).lineHeight)};
    if(!horizontal){box.left=r.left;box.top=r.top;box.width=r.width;box.height=r.height;}
    const oneLine=horizontal&&tr.height<style(e).lineHeight*1.6;
    if(oneLine){box.left=tr.left-rr.left;box.width=tr.width+1.5;}
    ops.push({type:'text',id,...box,text:content.trim(),layoutText,runs,...style(e),rotation:horizontal?0:90,mergeBox:!nodes&&oneLine&&pl+pr>=0,noWrap:oneLine,textGradient:c.backgroundClip==='text'?c.backgroundImage:null});
   }
   function walk(e){if(!visible(e)||['SCRIPT','STYLE','BUTTON'].includes(e.tagName))return;const id='e'+(++idx),c=getComputedStyle(e);if(e.tagName==='CANVAS'){warnings.push({id,kind:'unsupported-canvas'});return;}bg(e,id);
    for(const pseudo of ['::before','::after']){const ps=getComputedStyle(e,pseudo);if(ps.content!=='none'&&ps.content!=='normal'&&ps.display!=='none'){
      if(ps.content==='""'||ps.content==="''")bg(e,id+pseudo,pseudo);else warnings.push({id,kind:'pseudo-text',text:ps.content});
    }}
    if(e.tagName==='IMG'){ops.push({type:'image',id,...rect(e),src:e.currentSrc||e.src,alt:e.alt,fit:c.objectFit,blend:c.mixBlendMode,position:c.objectPosition,opacity:parseFloat(c.opacity)});return;}
    if(e.tagName.toLowerCase()==='svg'){
     const rootRect=rect(e);
     for(const bad of e.querySelectorAll('use,text,image,clipPath,mask,filter,linearGradient,radialGradient'))warnings.push({id,kind:'unsupported-svg-'+bad.tagName});
     for(const g of e.querySelectorAll('path,circle,ellipse,rect,line,polyline,polygon')){
      const gc=getComputedStyle(g);if(gc.display==='none'||gc.visibility==='hidden')continue;const m=g.getScreenCTM();if(!m)continue;
      const attrs=Object.fromEntries([...g.attributes].map(a=>[a.name,a.value]));
      ops.push({type:'svg',id:id+'-'+ops.length,tag:g.tagName,attrs,matrix:[m.a,m.b,m.c,m.d,m.e-rr.left,m.f-rr.top],fill:gc.fill,stroke:gc.stroke,strokeWidth:parseFloat(gc.strokeWidth),opacity:parseFloat(gc.opacity),rootRect});
     }return;
    }
    if(['UL','OL'].includes(e.tagName)){
     const items=[...e.children].filter(x=>x.tagName==='LI').map(li=>({text:li.innerText.trim(),...style(li),...rect(li)}));
     if(items.length){if(e.querySelector('li ul,li ol'))warnings.push({id,kind:'unsupported-nested-list'});ops.push({type:'list',id,...rect(e),items,ordered:e.tagName==='OL',...style(e)});return;}
    }
    const kids=[...e.children],hasBlock=kids.some(ch=>{let d=getComputedStyle(ch).display;return !['inline','contents','none'].includes(d)||['IMG','SVG'].includes(ch.tagName)});
    const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!hasBlock&&!['flex','grid','inline-flex','inline-grid'].includes(c.display)&&e.textContent.trim()){text(e,id);return;}
    if(!kids.length&&e.textContent.trim()){text(e,id);return;}
    for(const child of e.childNodes){if(child.nodeType===1)walk(child);else if(child.nodeType===3&&child.textContent.trim())text(e,id+'-direct-'+ops.length,[child]);}
   }
   walk(root);
   const texts=ops.filter(x=>x.type==='text').map(x=>x.text).concat(ops.filter(x=>x.type==='list').flatMap(x=>x.items.map(y=>y.text)));
   return {title:root.dataset.title||root.querySelector('h1,h2')?.innerText||`Slide ${i+1}`,width:rr.width,height:rr.height,ops,warnings,visibleText:root.innerText,texts};
  },{selector,i});
  data.sourcePage=i+1;
  await page.setViewportSize({width:Math.ceil(data.width),height:Math.ceil(data.height)});
  await page.locator(selector).nth(i).screenshot({path:path.join(out,`source-${String(i+1).padStart(2,'0')}.png`)});
  slides.push(data);console.log(`Extracted ${i+1}/${count}: ${data.title}`);
 }
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({source:path.resolve(input),selector,blockedRemoteResources:[...new Set(blocked)],slides},null,2));
}finally{await browser.close();}
