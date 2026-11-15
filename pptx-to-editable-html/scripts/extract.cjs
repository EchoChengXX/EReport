'use strict';
const fs=require('fs'),{launch}=require('./browser_common.cjs');
(async()=>{const job=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),browser=await launch();try{const page=await browser.newPage({viewport:{width:1600,height:1000}}),slides=[];
for(const item of job.pages){await page.setContent(fs.readFileSync(item.svg,'utf8'));await page.evaluate(()=>document.fonts.ready);let slide=await page.evaluate(({sourcePage,designW,designH})=>{
 let root=document.querySelector('svg');const W=root.viewBox.baseVal.width,H=root.viewBox.baseVal.height,prefix='s'+sourcePage+'_';root.style.cssText=`position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
 root.querySelectorAll('[id]').forEach(n=>n.id=prefix+n.id);
 root.outerHTML=root.outerHTML.replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${prefix}${id})`).replace(/(href=")#([^"]+)/g,(_,a,id)=>a+'#'+prefix+id);root=document.querySelector('svg');
 const defs=root.querySelector('defs')?.outerHTML||'',clipBounds={};
 for(const clip of root.querySelectorAll('clipPath')){let g=document.createElementNS('http://www.w3.org/2000/svg','g');for(const c of clip.children)g.append(c.cloneNode(true));root.append(g);try{let b=g.getBBox();clipBounds[clip.id]=[b.x,b.y,b.width,b.height]}finally{g.remove()}}
 let elements=[];const seen=new Set();
 for(const el of root.querySelectorAll('path,text,image,use,rect,circle,ellipse,polygon,polyline,line')){
  if(el.closest('defs,clipPath'))continue;let r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
  let x=r.x-1,y=r.y-1,w=r.width+2,h=r.height+2,c=el.cloneNode(true),cur=c;
  for(let a=el.parentElement;a&&a!==root;a=a.parentElement){let parent=a.cloneNode(false);parent.append(cur);cur=parent}
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${x} ${y} ${w} ${h}" width="100%" height="100%" overflow="visible">${cur.outerHTML}</svg>`;
  if(seen.has(svg))continue;seen.add(svg);
  elements.push({id:prefix+'e'+elements.length,type:'vector',kind:el.tagName,text:el.tagName==='text'?el.textContent:null,x:x*designW/W,y:y*designH/H,w:w*designW/W,h:h*designH/H,svg});
 }
 return {title:'原P'+sourcePage,sourcePage,background:'#fff',sourceW:W,sourceH:H,designW,designH,defs,clipBounds,elements};
},{sourcePage:item.sourcePage,designW:job.designW,designH:job.designH});slide.thumb=item.thumb;slides.push(slide);console.log('Extracted source slide '+item.sourcePage+': '+slide.elements.length+' primitives');}
fs.writeFileSync(job.result,JSON.stringify({title:job.title,slides}));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack||e);process.exit(1)});
