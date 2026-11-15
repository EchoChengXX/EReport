#!/usr/bin/env node
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {geometryCommands,transformCommands} from './svg_paths.mjs';
const req=createRequire(path.join(process.env.RUNTIME_NODE_MODULES||process.cwd()+'/node_modules','package.json'));const {Presentation,PresentationFile}=req('@oai/artifact-tool');const sharp=req('sharp');
const [manifestPath,output,...options]=process.argv.slice(2);if(!output)throw Error('Usage: build_pptx.mjs manifest.json draft.pptx [--render DIR]');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));const first=manifest.slides[0];const p=Presentation.create({slideSize:{width:first.width,height:first.height}}),report=[];
const color=(v,fallback='#182033')=>{if(!v||v==='none'||v==='transparent')return 'none';let m=v.match(/^rgba?\(([^)]+)\)/);if(m){let a=m[1].split(/[ ,/]+/).map(Number);if(a[3]===0)return 'none';let h='#'+a.slice(0,3).map(x=>Math.round(x).toString(16).padStart(2,'0')).join('');return a[3]!==undefined&&a[3]<1?h+'/'+Math.round(a[3]*100):h;}return /^#[\da-f]{3,8}$/i.test(v)?v:fallback;};
function fill(v){if(!v||v==='none')return 'none';if(!v.includes('gradient'))return color(v,'#ffffff');
 const start=v.lastIndexOf('linear-gradient(');if(start<0){const cols=v.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi)||[];return color(cols[0]||'#f7f8fe');}
 const str=v.slice(start);let depth=0,end=str.length;for(let i=0;i<str.length;i++){if(str[i]==='(')depth++;if(str[i]===')'&&--depth===0){end=i+1;break;}}
 const g=str.slice(0,end),cols=g.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi)||[];if(!cols.length)return'#f7f8fe';const angle=Number(g.match(/([\d.-]+)deg/)?.[1]||90);
 return {type:'gradient',gradientKind:'linear',angleDeg:(90-angle+360)%360,stops:cols.map((c,i)=>({offset:Math.round(i/(cols.length-1||1)*100000),color:color(c)==='none'?'#ffffff/0':color(c)}))};
}
function addShape(s,o,geometry='rect',f='none',line='none',weight=0){return s.shapes.add({geometry,name:o.id||o.type,position:{left:o.left,top:o.top,width:Math.max(.1,o.width),height:Math.max(.1,o.height)},fill:f,line:{fill:line,width:weight,style:'solid'}});}
function setText(q,o,text){q.text=text;q.text.style={typeface:'微软雅黑',fontSize:o.fontSize||14,bold:o.bold||false,italic:o.italic||false,color:color(o.color)==='none'?'#2469e8':color(o.color),alignment:({start:'left',end:'right'})[o.align]||(['left','right','center','justify'].includes(o.align)?o.align:'left'),verticalAlignment:'top',autoFit:'none',wrap:'none',insets:0};}
const imgcache=new Map();
for(let si=0;si<manifest.slides.length;si++){
 const page=manifest.slides[si],s=p.slides.add();s.background.fill='#fcfdff';const bgmap=new Map(),stats={page:si+1,title:page.title,texts:0,mergedLabels:0,nativeSvg:0,images:0,lists:0,warnings:page.warnings.filter(w=>w.kind.startsWith('unsupported-'))};
 for(const o of page.ops){try{
  if(o.type==='box'){
   const solid=o.border?.filter(b=>b.width>0&&b.style!=='none')||[],uniform=solid.length===4&&solid.every(b=>b.width===solid[0].width&&b.color===solid[0].color);
   let q=addShape(s,o,o.radius>0?'roundRect':'rect',fill(o.fill),uniform?color(solid[0].color):'none',uniform?solid[0].width:0);
   if(o.radius>0)q.adjustmentList=[{name:'adj',formula:'val '+Math.min(50000,Math.round(o.radius/Math.max(.1,Math.min(o.width,o.height))*100000))}];
   bgmap.set(o.id,{shape:q,op:o});
   if(!uniform)for(let i=0;i<4;i++){let b=o.border?.[i];if(!b||!b.width||color(b.color)==='none')continue;let edges=[{left:o.left,top:o.top,width:o.width,height:b.width},{left:o.left+o.width-b.width,top:o.top,width:b.width,height:o.height},{left:o.left,top:o.top+o.height-b.width,width:o.width,height:b.width},{left:o.left,top:o.top,width:b.width,height:o.height}];addShape(s,{...edges[i],id:o.id+'-border-'+i},'rect',color(b.color));}
  }else if(o.type==='text'){
   const prev=bgmap.get(o.id),eligible=prev&&o.mergeBox&&prev.op.width<600&&prev.op.height<110&&o.text.length<85;
   let q;if(eligible){q=prev.shape;const b=prev.op;setText(q,o,o.layoutText||o.text);q.text.insets={left:Math.max(0,o.left-b.left),right:Math.max(0,b.left+b.width-o.left-o.width),top:Math.max(0,o.top-b.top),bottom:0};stats.mergedLabels++;}
   else {q=addShape(s,o,'textbox');setText(q,o,o.layoutText||o.text);}
   // Keep browser line grouping and rich styles in one native text body.
   const rendered=o.rotation===90?o.text:(o.layoutText||o.text);
   if(o.runs?.length){
    const sourceChars=o.runs.flatMap(r=>Array.from(r.text).filter(c=>!(/\s/.test(c))).map(char=>({char,r})));
    const targetChars=Array.from(rendered).filter(c=>!(/\s/.test(c)));
    if(sourceChars.map(x=>x.char).join('')===targetChars.join('')){
     let at=0;
     const paras=rendered.split('\n').map(line=>{
      const chunks=[];let last=o.runs[0];
      for(const char of Array.from(line)){
       const r=/\s/.test(char)?last:sourceChars[at++].r;last=r;
       const sty={typeface:'微软雅黑',fontSize:r.fontSize+'px',bold:r.bold,italic:r.italic,color:r.textGradient?fill(r.textGradient):(color(r.color)==='none'?'#2469e8':color(r.color))};
       const key=JSON.stringify(sty);
       if(chunks.at(-1)?.key===key)chunks.at(-1).run+=char;else chunks.push({key,run:char,style:sty});
      }
      return chunks.map(({key,...r})=>r);
     });q.text=paras;
    }
   }
   if(o.textGradient)q.text.fill=fill(o.textGradient);
   stats.texts++;
  }else if(o.type==='list'){
   const it=o.items,lo=it[0].left,top=it[0].top,right=Math.max(...it.map(x=>x.left+x.width)),bottom=Math.max(...it.map(x=>x.top+x.height));
   let q=addShape(s,{...o,left:lo-it[0].fontSize,top,width:right-lo+it[0].fontSize,height:bottom-top+3,id:o.id+'-list'},'textbox');
   const paragraphs=it.map((x,j)=>({bulletCharacter:o.ordered?undefined:'•',marginLeft:Math.round((x.fontSize||14)*9525),indent:-Math.round((x.fontSize||14)*9525),spaceAfter:0,runs:[{run:x.text.replace(/^[•·]\s*/,''),style:{typeface:'微软雅黑',fontSize:x.fontSize+'px',bold:x.bold,color:color(x.color)}}]}));
   setText(q,it[0],paragraphs);stats.lists++;
  }else if(o.type==='image'){
   let data=imgcache.get(o.src);if(!data){if(o.src.startsWith('data:')){data=Buffer.from(o.src.split(',')[1],o.src.includes(';base64,')?'base64':'utf8');}else if(o.src.startsWith('file:')){data=await fs.readFile(new URL(o.src));}else throw Error('Remote image unavailable in offline export');
    if(o.blend==='multiply'){const raw=await sharp(data).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let k=0;k<raw.data.length;k+=4){const base=Math.min(raw.data[k],raw.data[k+1],raw.data[k+2]);const alpha=255-base;for(let c=0;c<3;c++)raw.data[k+c]=alpha?Math.round((raw.data[k+c]-base)*255/alpha):0;raw.data[k+3]=Math.round(raw.data[k+3]*alpha/255);}data=await sharp(raw.data,{raw:raw.info}).png().toBuffer();}else data=await sharp(data).png().toBuffer();imgcache.set(o.src,data);
   }
   s.images.add({name:o.id,blob:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),contentType:'image/png',alt:o.alt||'原HTML图片',fit:o.fit==='cover'?'cover':'contain',position:{left:o.left,top:o.top,width:o.width,height:o.height}});stats.images++;
  }else if(o.type==='svg'){
   if([o.fill,o.stroke].some(v=>v?.includes('url(')))throw Error('SVG paint-server references require native adaptation');
   let cmds=transformCommands(geometryCommands(o.tag,o.attrs),o.matrix),coords=[];
   for(const c of cmds){const v=Object.values(c)[0];if(!v)continue;for(const k of ['','1','2'])if(v['x'+k]!==undefined)coords.push([v['x'+k],v['y'+k]]);}
   if(!coords.length)continue;const x=Math.min(...coords.map(p=>p[0])),y=Math.min(...coords.map(p=>p[1])),w=Math.max(.1,Math.max(...coords.map(p=>p[0]))-x),h=Math.max(.1,Math.max(...coords.map(p=>p[1]))-y);
   cmds=transformCommands(cmds,[1,0,0,1,-x,-y]);
   s.shapes.add({geometry:'custom',name:o.id,position:{left:x,top:y,width:w,height:h},fill:color(o.fill),line:{fill:color(o.stroke),width:o.strokeWidth*Math.hypot(o.matrix[0],o.matrix[1]),style:'solid'},customPaths:[{width:w,height:h,commands:cmds}]});stats.nativeSvg++;
  }
 }catch(e){stats.warnings.push({id:o.id,type:o.type,error:e.message});}}
 s.speakerNotes.text='源文件：'+manifest.source+'\n原页：'+(page.sourcePage||si+1)+' '+page.title+'\nHTML文字和图形按DOM重建；源照片、截图与品牌标志保持为图片。';report.push(stats);
 console.log('Built '+(si+1)+'/'+manifest.slides.length);
}
await fs.mkdir(path.dirname(output),{recursive:true});await(await PresentationFile.exportPptx(p)).save(output);
await fs.writeFile(output+'.report.json',JSON.stringify(report,null,2));
const ri=options.indexOf('--render');if(ri>=0){await fs.mkdir(options[ri+1],{recursive:true});for(let i=0;i<p.slides.items.length;i++){let blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(options[ri+1],`draft-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));console.log('Rendered '+(i+1));}}
if(report.some(x=>x.warnings.length)){console.error('Conversion requires adaptation; see '+output+'.report.json');process.exitCode=2;}
