#!/usr/bin/env python3
"""Read-only PPTX audit; standard library only. Findings require visual review."""
import argparse,json,zipfile,xml.etree.ElementTree as ET
from collections import Counter
N={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
A='{'+N['a']+'}'
def rect(s):
 x=s.find('p:spPr/a:xfrm',N)
 if x is None:return None
 o=x.find('a:off',N);e=x.find('a:ext',N)
 if o is None or e is None:return None
 return tuple(int(v) for v in (o.get('x'),o.get('y'),e.get('cx'),e.get('cy')))
def audit(path,no_images=False):
 result={'file':str(path),'slides':[],'fonts':{},'issues':[]}
 fonts=Counter()
 with zipfile.ZipFile(path) as z:
  for name in z.namelist():
   if name.startswith('ppt/') and name.endswith('.xml'):
    r=ET.fromstring(z.read(name))
    fonts.update(e.get('typeface') for e in r.iter() if e.get('typeface'))
   if not(name.startswith('ppt/slides/slide') and name.endswith('.xml')):continue
   r=ET.fromstring(z.read(name));shapes=r.findall('.//p:sp',N);groups=[];typed=[];same=[];single=[];geom={}
   for s in shapes:
    ident=s.find('p:nvSpPr/p:cNvPr',N);sid=ident.get('id') if ident is not None else '?'
    texts=''.join(s.itertext()) # Used only for existence diagnostics below.
    ps=s.findall('p:txBody/a:p',N);bullets=0
    for p in ps:
     t=''.join(e.text or '' for e in p.iter(A+'t'))
     if t.lstrip().startswith(('•','·')):typed.append(sid)
     if p.find('a:pPr/a:buChar',N) is not None:bullets+=1
    if bullets:groups.append({'shape_id':sid,'paragraphs':bullets})
    if bullets==1:single.append(sid)
    key=rect(s)
    if key:
     if key in geom:same.append([geom[key],sid])
     geom[key]=sid
   pics=len(r.findall('.//p:pic',N))
   row={'part':name,'native_shapes':len(shapes),'pictures':pics,'native_bullet_groups':groups,'single_bullet_shapes_review':single,'typed_bullet_shapes':typed,'identical_bounds_review':same}
   result['slides'].append(row)
   if typed:result['issues'].append(name+': typed bullet prefixes')
   if no_images and pics:result['issues'].append(name+': image objects present')
  result['fonts']=dict(fonts)
  if any(f!='微软雅黑' for f in fonts):result['issues'].append('Font values other than 微软雅黑 present')
  if not fonts:result['issues'].append('No explicit typefaces found')
  result['media_files']=[n for n in z.namelist() if n.startswith('ppt/media/')]
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('pptx');p.add_argument('--expect-no-images',action='store_true');a=p.parse_args()
 r=audit(a.pptx,a.expect_no_images);print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(bool(r['issues']))
