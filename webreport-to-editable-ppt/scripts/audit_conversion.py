#!/usr/bin/env python3
"""Compare DOM text coverage and native PPT structures. Does not prove visual fidelity."""
import argparse,json,re,zipfile,xml.etree.ElementTree as E
from pathlib import Path
from collections import Counter
N={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
A='{'+N['a']+'}'
def chars(s):return Counter(re.sub(r'\s+','',s))
def audit(manifest,pptx):
 m=json.loads(Path(manifest).read_text());report={'slides':[],'issues':[],'fonts':[]};fonts=set()
 with zipfile.ZipFile(pptx) as z:
  parts=[n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)]
  if len(parts)!=len(m['slides']):report['issues'].append('Slide count mismatch')
  for i,page in enumerate(m['slides'],1):
   r=E.fromstring(z.read(f'ppt/slides/slide{i}.xml'));text=''.join(t.text or '' for t in r.iter(A+'t'))
   expected=chars(page['visibleText']);actual=chars(text);missing=expected-actual;extra=actual-expected
   bullet_groups=[len(s.findall('.//a:buChar',N)) for s in r.findall('.//p:sp',N) if s.find('.//a:buChar',N) is not None]
   row={'page':i,'title':page['title'],'text_characters':sum(actual.values()),'missing_characters':dict(missing),'extra_characters':dict(extra),'native_shapes':len(r.findall('.//p:sp',N)),'native_paths':len(r.findall('.//a:custGeom',N)),'source_svg_parts':sum(o['type']=='svg' for o in page['ops']),'source_list_groups':sum(o['type']=='list' for o in page['ops']),'native_bullet_groups':bullet_groups,'pictures':len(r.findall('.//p:pic',N))}
   if missing or extra:report['issues'].append(f'Page {i}: text character mismatch; inspect ordering and substitutions')
   if row['source_svg_parts']!=row['native_paths']:report['issues'].append(f'Page {i}: SVG part count mismatch')
   if row['source_list_groups']!=len(bullet_groups):report['issues'].append(f'Page {i}: list group count mismatch')
   report['slides'].append(row)
  for n in z.namelist():
   if n.startswith('ppt/') and n.endswith('.xml'):
    r=E.fromstring(z.read(n));fonts.update(e.get('typeface') for e in r.iter() if e.get('typeface'))
  if fonts!={'微软雅黑'}:report['issues'].append('Font slot mismatch')
 report['fonts']=sorted(fonts);report['native_shapes']=sum(s['native_shapes'] for s in report['slides']);report['native_svg_paths']=sum(s['native_paths'] for s in report['slides']);return report
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest');p.add_argument('pptx');p.add_argument('--report');a=p.parse_args();r=audit(a.manifest,a.pptx);data=json.dumps(r,ensure_ascii=False,indent=2)
 if a.report:Path(a.report).write_text(data)
 print(json.dumps({'slides':len(r['slides']),'native_shapes':r['native_shapes'],'native_svg_paths':r['native_svg_paths'],'fonts':r['fonts'],'issues':r['issues']},ensure_ascii=False,indent=2));raise SystemExit(bool(r['issues']))
