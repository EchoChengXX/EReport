#!/usr/bin/env python3
"""Set all font slots and browser-derived text spacing in a new PPTX. Stdlib only."""
import argparse,json,zipfile,xml.etree.ElementTree as E,re
from pathlib import Path
N={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
A='{'+N['a']+'}';P='{'+N['p']+'}'
def run(src,manifest,dest):
 if Path(src).resolve()==Path(dest).resolve():raise ValueError('Use a new output path')
 m=json.loads(Path(manifest).read_text());fonts=lists=0
 with zipfile.ZipFile(src) as zi,zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as zo:
  for f in zi.infolist():
   data=zi.read(f.filename)
   if f.filename.startswith('ppt/') and f.filename.endswith('.xml'):
    r=E.fromstring(data)
    for e in r.iter():
     if 'typeface' in e.attrib:e.set('typeface','微软雅黑')
    for e in list(r.iter()):
     if e.tag in [A+'rPr',A+'defRPr',A+'endParaRPr']:
      for tag in ['latin','ea','cs']:
       c=e.find(A+tag)
       if c is None:c=E.SubElement(e,A+tag)
       c.set('typeface','微软雅黑')
      fonts+=1
    sn=re.fullmatch(r'ppt/slides/slide(\d+)\.xml',f.filename)
    if sn:
     page=m['slides'][int(sn[1])-1];ops={o['id']:o for o in page['ops'] if o['type'] in ['text','list']}
     for sp in r.findall('.//p:sp',N):
      nv=sp.find('p:nvSpPr/p:cNvPr',N)
      if nv is None:continue
      name=nv.get('name','');o=ops.get(name) or ops.get(name.removesuffix('-list'))
      if not o:continue
      tx=sp.find('p:txBody',N)
      if tx is None:continue
      bp=tx.find(A+'bodyPr')
      if bp is not None:
       bp.set('wrap','none')
       if o.get('rotation')==90:bp.set('vert','vert');bp.set('anchor','ctr')
      ps=tx.findall(A+'p')
      for j,p in enumerate(ps):
       pr=p.find(A+'pPr')
       if pr is None:pr=E.Element(A+'pPr');p.insert(0,pr)
       if o.get('rotation')==90:pr.set('algn','ctr')
       line=o.get('lineHeight',o.get('fontSize',14)*1.2);after=0
       if o['type']=='list':
        items=o['items'];it=items[min(j,len(items)-1)];line=it['lineHeight'];after=max(0,items[j+1]['top']-it['top']-it['height']) if j+1<len(items) else 0
        if not o.get('ordered'):
         for tag in ['buNone','buAutoNum','buFont','buChar']:
          old=pr.find(A+tag)
          if old is not None:pr.remove(old)
         idx=list(pr).index(pr.find(A+'defRPr')) if pr.find(A+'defRPr') is not None else len(pr)
         pr.insert(idx,E.Element(A+'buFont',typeface='微软雅黑'));pr.insert(idx+1,E.Element(A+'buChar',char='•'))
         left=round(it['fontSize']*9525);pr.set('marL',str(left));pr.set('indent',str(-left));lists+=1
        else:
         old=pr.find(A+'buChar')
         if old is not None:pr.remove(old)
         E.SubElement(pr,A+'buAutoNum',type='arabicPeriod',startAt='1' if j==0 else str(j+1))
       for tag in ['lnSpc','spcBef','spcAft']:
        old=pr.find(A+tag)
        if old is not None:pr.remove(old)
       for k,(tag,value) in enumerate([('lnSpc',line),('spcBef',0),('spcAft',after)]):
        el=E.Element(A+tag);E.SubElement(el,A+'spcPts',val=str(round(value*75)));pr.insert(k,el)
    data=E.tostring(r,encoding='utf-8',xml_declaration=True)
   zo.writestr(f,data)
 return {'font_properties':fonts,'native_bullet_paragraphs':lists,'slides':len(m['slides'])}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('manifest');p.add_argument('output');a=p.parse_args();print(json.dumps(run(a.source,a.manifest,a.output),ensure_ascii=False))
