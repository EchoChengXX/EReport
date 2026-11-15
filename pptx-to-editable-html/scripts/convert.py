#!/usr/bin/env python3
"""PPTX -> standalone editable SVG-object HTML. Scratch artifacts stay in a temporary directory."""
from pathlib import Path
from collections import defaultdict
from lxml import etree as ET
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
import argparse,base64,copy,hashlib,html,json,os,re,shutil,subprocess,tempfile,zipfile
import fitz
BASE=Path(__file__).resolve().parents[1]
NS={'s':'http://www.w3.org/2000/svg'}

def clean(s):return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',s)
def norm(s):return re.sub(r'\s+','',s or '')
def pagespec(spec,total):
 if not spec:return list(range(1,total+1))
 out=[]
 for part in spec.split(','):
  ab=part.strip().split('-');a=int(ab[0]);b=int(ab[-1]);assert 1<=a<=b<=total,'Page range out of bounds'
  out.extend(range(a,b+1))
 return list(dict.fromkeys(out))
def walk(shapes,ox,oy,kx,ky):
 for sh in shapes:
  x=ox+sh.left*kx;y=oy+sh.top*ky;w=sh.width*kx;h=sh.height*ky
  if sh.shape_type==MSO_SHAPE_TYPE.GROUP:
   xf=sh._element.grpSpPr.xfrm
   if not int(xf.chExt.cx) or not int(xf.chExt.cy):continue
   xx=w/int(xf.chExt.cx);yy=h/int(xf.chExt.cy)
   yield from walk(sh.shapes,x-int(xf.chOff.x)*xx,y-int(xf.chOff.y)*yy,xx,yy)
  else:
   yield dict(x=x,y=y,w=w,h=h,text=getattr(sh,'text','').replace('\v','\n'),name=sh.name,shapeType=int(sh.shape_type),rotation=sh.rotation,isVideo=(int(getattr(sh,'media_type',0) or 0)==3))
   if sh.has_table:
    yy=y
    for row in sh.table.rows:
     xx=x
     for col,cell in enumerate(row.cells):
      ww=sh.table.columns[col].width*kx;hh=row.height*ky
      if not cell.is_spanned:yield dict(x=xx,y=yy,w=ww,h=hh,text=cell.text.replace('\v','\n'),name=sh.name+' / cell',shapeType=0,rotation=0)
      xx+=ww
     yy+=row.height*ky

def combine(es,slide,text=None,bounds=None):
 if bounds is None:
  x=min(e['x'] for e in es);y=min(e['y'] for e in es);w=max(e['x']+e['w'] for e in es)-x;h=max(e['y']+e['h'] for e in es)-y
  bounds=[x*slide['sourceW']/1280,y*slide['sourceH']/720,w*slide['sourceW']/1280,h*slide['sourceH']/720]
 else:
  x=bounds[0]*1280/slide['sourceW'];y=bounds[1]*720/slide['sourceH'];w=bounds[2]*1280/slide['sourceW'];h=bounds[3]*720/slide['sourceH']
 root=ET.Element('{http://www.w3.org/2000/svg}svg',nsmap={None:'http://www.w3.org/2000/svg','xlink':'http://www.w3.org/1999/xlink'})
 for k,v in {'viewBox':' '.join(map(str,bounds)),'width':'100%','height':'100%','overflow':'visible'}.items():root.set(k,v)
 for e in es:
  part=ET.fromstring(clean(e['svg']).encode())
  for child in part:root.append(child)
 z=dict(es[0],x=x,y=y,w=w,h=h,text=text,kind='textbox' if text is not None else 'shape',svg=ET.tostring(root,encoding='unicode'))
 if text is not None:
  fonts=root.findall('.//s:text',NS);sizes=[float(f.get('font-size','14'))*720/slide['sourceH'] for f in fonts];z.update(editSize=max(sizes,default=18),editColor=next((f.get('fill') for f in fonts if f.get('fill')),'#182033'),editFont=fonts[0].get('font-family','sans-serif') if fonts else 'sans-serif')
 return z

def replace_groups(slide,groups,texts=None,bounds=None):
 repl={};gone=set();merged=0
 for key,es in groups.items():
  if not es:continue
  z=combine(es,slide,(texts or {}).get(key),(bounds or {}).get(key));repl[es[0]['id']]=z;gone.update(e['id'] for e in es[1:]);merged+=len(es)-1
 slide['elements']=[repl.get(e['id'],e) for e in slide['elements'] if e['id'] not in gone]
 return repl,merged

def postprocess(slide,boxes,normalize_titles=False):
 stats={'sourcePage':slide['sourcePage'],'initialPrimitives':len(slide['elements'])};tb=[b for b in boxes if b['text'].strip()];assigned=defaultdict(list)
 for e in slide['elements']:
  if e['text'] is None or not norm(e['text']):continue
  cx=e['x']+e['w']/2;cy=e['y']+e['h']/2;opts=[]
  for i,b in enumerate(tb):
   if norm(e['text']) not in norm(b['text']):continue
   dx=max(b['x']-cx,0,cx-b['x']-b['w']);dy=max(b['y']-cy,0,cy-b['y']-b['h'])
   if dx<35 and dy<20:opts.append((dx*5+dy*5+abs(cy-b['y']-b['h']/2)*.1+b['w']*b['h']*.00001,i))
  if opts:assigned[min(opts)[1]].append(e)
 repl,n=replace_groups(slide,assigned,{i:tb[i]['text'] for i in assigned});stats['textFragmentsMerged']=n
 for i,es in assigned.items():repl[es[0]['id']]['sourceName']=tb[i]['name']
 stats['sourceTextboxes']=len(tb);stats['semanticTextboxes']=len(assigned);stats['unmatchedSourceTextboxes']=[b['name'] for i,b in enumerate(tb) if i not in assigned]
 # Clip paths express the visual shape boundary; combine its painted bands as one object.
 clips=defaultdict(list);clipbounds={}
 for e in slide['elements']:
  if e.get('kind')!='path' or e['text'] is not None:continue
  ids=re.findall(r'clip-path="url\(#([^)]+)\)"',e['svg'])
  if not ids:continue
  key=ids[-1];b=slide['clipBounds'].get(key)
  if not b or b[2]<=0 or b[3]<=0:continue
  if b[2]>=slide['sourceW']*.98 and b[3]>=slide['sourceH']*.98:continue
  clips[key].append(e);clipbounds[key]=b
 clips={k:v for k,v in clips.items() if len(v)>1};_,n=replace_groups(slide,clips,bounds=clipbounds);stats['gradientFragmentsMerged']=n
 # Rejoin fill/outline fragments using original shape geometry without flattening images.
 shapes=[b for b in boxes if b['w']>2 and b['h']>2 and b['shapeType']!=16];groups=defaultdict(list)
 for e in slide['elements']:
  if e['text'] is not None or e['kind'] in ('image','use'):continue
  cx=e['x']+e['w']/2;cy=e['y']+e['h']/2;opts=[]
  for i,b in enumerate(shapes):
   if b['x']-3<=cx<=b['x']+b['w']+3 and b['y']-3<=cy<=b['y']+b['h']+3 and e['w']<=b['w']+10 and e['h']<=b['h']+10:opts.append((b['w']*b['h'],i))
  if opts:groups[min(opts)[1]].append(e)
 groups={k:v for k,v in groups.items() if len(v)>1};repl,n=replace_groups(slide,groups);stats['shapeFragmentsMerged']=n
 for i,es in groups.items():repl[es[0]['id']]['sourceName']=shapes[i]['name']
 # Masked, uniform dark raster images around a native shape are renderer shadows.
 # Attach only when both geometry and raster evidence agree; source photographs stay separate.
 shadow_groups={};shadow_targets={};used=set()
 for shadow in list(slide['elements']):
  if shadow['kind']!='image' or 'mask=' not in shadow['svg'] or not re.search(r'opacity="(?:0?\.[0-6]\d*)"',shadow['svg']):continue
  data=re.search(r'data:image/[^;]+;base64,([^"]+)',shadow['svg'],re.S)
  if not data:continue
  try:
   pix=fitz.Pixmap(base64.b64decode(data[1]));samples=pix.samples
   if not samples or max(samples)>160 or max(samples)-min(samples)>18:continue
  except Exception:continue
  candidates=[]
  for b in boxes:
   if b['shapeType']!=1 or b['w']<10 or b['h']<10:continue
   margins=[b['x']-shadow['x'],b['y']-shadow['y'],shadow['x']+shadow['w']-b['x']-b['w'],shadow['y']+shadow['h']-b['y']-b['h']]
   if not all(-4<=v<=28 for v in margins):continue
   for body in slide['elements']:
    if body['id'] in used or body['text'] is not None or body['kind'] not in ('shape','path'):continue
    delta=abs(body['x']-b['x'])+abs(body['y']-b['y'])+abs(body['w']-b['w'])+abs(body['h']-b['h'])
    if delta<20:candidates.append((delta,b['name'],body))
  if candidates:
   _,name,body=min(candidates,key=lambda v:v[0]);ordered=sorted([shadow,body],key=lambda e:slide['elements'].index(e));shadow_groups[shadow['id']]=ordered;shadow_targets[shadow['id']]=name;used.update(e['id'] for e in ordered)
 repl,n=replace_groups(slide,shadow_groups);stats['shadowFragmentsMerged']=n
 for key,es in shadow_groups.items():repl[es[0]['id']]['sourceName']=shadow_targets[key]
 if normalize_titles:
  for e in slide['elements']:
   if e.get('kind')!='textbox' or e['y']>=65 or e['h']>=100 or e['w']<=360 or e.get('editSize',0)<25:continue
   # Cover and section titles away from the page header are deliberately unaffected.
   text=' '.join(e['text'].split());size=34 if sum(1 if ord(c)>255 else .55 for c in text)<30 else 30
   e.update(x=48,y=28,w=1039,h=50,kind='title',editSize=size,editColor='#2469E8',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1039 50"><text x="0" y="37" fill="#2469E8" font-size="{size}" font-weight="700" font-family="Microsoft YaHei,Arial,sans-serif">{html.escape(text)}</text></svg>')
 stats['rotatedConnectors']=[{k:b[k] for k in ['name','x','y','w','h','rotation']} for b in boxes if b['shapeType']==9 and b['rotation']%180!=0]
 stats['unmergedTextRuns']=sum(e['kind']=='text' for e in slide['elements']);stats['finalObjects']=len(slide['elements']);stats['warnings']=[]
 if stats['rotatedConnectors']:stats['warnings'].append('Rotated connectors require visual review; the renderer may place elbow segments through text. Reconstruct only after confirming source endpoints.')
 if stats['unmatchedSourceTextboxes']:stats['warnings'].append('Some original text boxes could not be confidently assigned; inspect rotated/outlined text, tables, or hidden objects.')
 stats['outOfPageObjects']=[e['id'] for e in slide['elements'] if e['x'] < -5 or e['y'] < -5 or e['x']+e['w']>1285 or e['y']+e['h']>725]
 if stats['outOfPageObjects']:stats['warnings'].append('Objects extend outside the slide; check connectors, shadows and source crop behavior rather than deleting them automatically.')
 slide.pop('clipBounds',None)
 return stats

def render_html(deck,output):
 raw=json.dumps(deck,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026');template=(BASE/'assets/editor.html').read_text();assert template.count('__DECK_JSON__')==1
 Path(output).write_text(template.replace('__DECK_JSON__',raw))

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input',type=Path);ap.add_argument('output',type=Path);ap.add_argument('--pages',help='Original page numbers, e.g. 1,14-15,48,75');ap.add_argument('--omit-pure-video',action='store_true');ap.add_argument('--normalize-titles',choices=['preserve','webreport'],default='preserve');ap.add_argument('--work-dir',type=Path,help='Retain scratch files here for QA; otherwise automatically cleaned');ap.add_argument('--qa-report',type=Path);ap.add_argument('--soffice');ap.add_argument('--node',default='node');ap.add_argument('--patches',type=Path,help='Explicit page/object repair JSON; see reference schema');ap.add_argument('--pdf',type=Path,help='Optional already-rendered PDF, must have exactly the PPTX page count');args=ap.parse_args()
 args.input=args.input.resolve();args.output=args.output.resolve()
 if args.output.exists():raise SystemExit('Output exists; choose a new path rather than overwriting.')
 if args.input.suffix.lower()!='.pptx':raise SystemExit('Only .pptx is supported. Convert legacy .ppt explicitly first.')
 prs=Presentation(args.input)
 if abs(prs.slide_width/prs.slide_height-16/9)>.02:raise SystemExit('This editor currently supports 16:9 PPTX only; do not stretch a different aspect ratio.')
 selected=pagespec(args.pages,len(prs.slides));before=hashlib.sha256(args.input.read_bytes()).hexdigest()
 report={'input':str(args.input),'input_sha256':before,'sourcePages':len(prs.slides),'selectedSourcePages':selected,'omittedPureVideoPages':[],'pages':[],'limitations':['Static rendering only; animations and video playback are not converted.','Photographs and source screenshots remain raster images.','On text replacement, the paragraph uses its dominant style; mixed character formatting may require manual adjustment.','Font availability and LibreOffice/PPT rendering differences require visual review.']}
 temp=None
 if args.work_dir:work=args.work_dir.resolve();work.mkdir(parents=True,exist_ok=True)
 else:temp=tempfile.TemporaryDirectory(prefix='pptx-editable-html-');work=Path(temp.name)
 try:
  meta=[]
  for num in selected:
   s=prs.slides[num-1];boxes=list(walk(s.shapes,0,0,1280/prs.slide_width,720/prs.slide_height));has_video=any(b.get('isVideo',False) for b in boxes);has_static=any(b['shapeType']!=16 and (b['text'].strip() or b['w']*b['h']>20) for b in boxes)
   if args.omit_pure_video and has_video and not has_static:report['omittedPureVideoPages'].append(num);continue
   meta.append((num,boxes))
  if not meta:raise ValueError('No pages remain after selection and video policy.')
  if args.pdf:pdf=args.pdf.resolve()
  else:
   static=work/'source-static.pptx'
   with zipfile.ZipFile(args.input) as source,zipfile.ZipFile(static,'w',zipfile.ZIP_DEFLATED) as target:
    for n in source.namelist():
     if not n.lower().endswith(('.mp4','.mov','.wmv','.avi','.mpeg')):target.writestr(n,source.read(n))
   soffice=args.soffice or shutil.which('soffice') or ('/Applications/LibreOffice.app/Contents/MacOS/soffice' if Path('/Applications/LibreOffice.app/Contents/MacOS/soffice').exists() else None)
   if not soffice:raise RuntimeError('LibreOffice not found. Supply --soffice or a rendered --pdf; do not substitute screenshot-only HTML.')
   profile=(work/'lo-profile').as_uri();cmd=[soffice,'-env:UserInstallation='+profile,'--headless','--convert-to','pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}','--outdir',str(work),str(static)];subprocess.run(cmd,check=True,timeout=300);pdf=work/'source-static.pdf'
  doc=fitz.open(pdf)
  if len(doc)!=len(prs.slides):raise RuntimeError(f'Rendered {len(doc)} pages but PPTX has {len(prs.slides)}. Include hidden pages before mapping.')
  job={'title':args.input.stem,'designW':1280,'designH':720,'pages':[],'result':str(work/'primitives.json')}
  for num,_ in meta:
   page=doc[num-1];svg=work/f'p{num:03d}.svg';svg.write_text(page.get_svg_image(text_as_path=False));thumb='data:image/jpeg;base64,'+base64.b64encode(page.get_pixmap(matrix=fitz.Matrix(180/page.rect.width,180/page.rect.width)).tobytes('jpeg')).decode();job['pages'].append({'sourcePage':num,'svg':str(svg),'thumb':thumb})
  (work/'job.json').write_text(json.dumps(job));subprocess.run([args.node,str(BASE/'scripts/extract.cjs'),str(work/'job.json')],check=True,timeout=300)
  deck=json.loads((work/'primitives.json').read_text());deck['source']={'name':args.input.name,'sha256':before,'pages':len(prs.slides),'omittedPureVideoPages':report['omittedPureVideoPages']}
  for slide,(num,boxes) in zip(deck['slides'],meta):
   report['pages'].append(postprocess(slide,boxes,args.normalize_titles=='webreport' and num not in (1,len(prs.slides))));slide['title']=f'原P{num:02d}'
  if args.patches:
   patch=json.loads(args.patches.read_text())
   if patch.get('source_sha256') and patch['source_sha256']!=before:raise ValueError('Repair patch source fingerprint does not match.')
   report['repairs']=[]
   bypage={s['sourcePage']:s for s in deck['slides']}
   for change in patch.get('pages',[]):
    page=bypage.get(change['sourcePage'])
    if page is None:raise ValueError('Repair page is outside selected source pages.')
    ids={e['id'] for e in page['elements']};removed=set(change.get('remove_ids',[]));updates=change.get('update_by_id',{})
    if not removed.issubset(ids) or not set(updates).issubset(ids):raise ValueError('Repair refers to an unknown object ID.')
    page['elements']=[e for e in page['elements'] if e['id'] not in removed]
    for e in page['elements']:
     if e['id'] in updates:
      changes=updates[e['id']]
      if 'id' in changes:raise ValueError('Repair may not rename existing object IDs.')
      e.update(changes)
    live_ids={e['id'] for e in page['elements']}
    for e in change.get('add_elements',[]):
     if not e.get('id') or e['id'] in live_ids or e.get('w',0)<=0 or e.get('h',0)<=0:raise ValueError('Invalid repair element.')
     page['elements'].append(e);live_ids.add(e['id'])
    page['edited']=True
    report['repairs'].append({'sourcePage':page['sourcePage'],'removed':len(removed),'updated':len(updates),'added':len(change.get('add_elements',[]))})
  args.output.parent.mkdir(parents=True,exist_ok=True);render_html(deck,args.output);assert hashlib.sha256(args.input.read_bytes()).hexdigest()==before
  report.update(output=str(args.output),outputPages=len(deck['slides']),outputBytes=args.output.stat().st_size,editableTextboxes=sum(e['text'] is not None for s in deck['slides'] for e in s['elements']),objects=sum(len(s['elements']) for s in deck['slides']))
  (work/'final-deck.json').write_text(json.dumps(deck,ensure_ascii=False));(work/'conversion-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  if args.qa_report:args.qa_report.parent.mkdir(parents=True,exist_ok=True);args.qa_report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps({k:report[k] for k in ['output','sourcePages','outputPages','omittedPureVideoPages','editableTextboxes','objects']},ensure_ascii=False,indent=2))
 finally:
  if temp:temp.cleanup()
if __name__=='__main__':main()
