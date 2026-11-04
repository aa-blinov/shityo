"""Add only individually verified publisher pages, retaining original downloads."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
import json,re,sys
from pathlib import Path
from urllib.parse import urlparse,urljoin
from urllib.request import Request,urlopen
from import_freesewing_library import Links

ROOT=Path(__file__).resolve().parents[1]
class Metadata(HTMLParser):
 def __init__(self):super().__init__();self.meta={};self.h1=False;self.title='';self.images=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='meta':self.meta[a.get('property',a.get('name',''))]=a.get('content','')
  if tag=='h1':self.h1=True
  if tag=='img':self.images.append(a)
 def handle_endtag(self,tag):
  if tag=='h1':self.h1=False
 def handle_data(self,data):
  if self.h1:self.title+=data
def fetch(url):
 with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=35) as r:return r.read().decode('utf-8')
def infer(title):
 text=title.lower()
 for words,section in [(['coat','jacket'],'outerwear'),(['pants','trouser','jeans','shorts'],'bottoms'),(['skirt'],'skirts'),(['dress','jumpsuit'],'dresses')]:
  if any(w in text for w in words):return section
 return 'tops'
def main():
 tasks=[]
 for provider,source,host in [('mood','Mood Sewciety','blog.moodfabrics.com'),('tiana',"Tiana’s Closet",'tianascloset.com')]:
  parser=Links();parser.feed((ROOT/f'work/{provider}-source.html').read_text(encoding='utf-8'))
  seen=set()
  for a in parser.links:
   if urlparse(a['url']).hostname!=host or '/category/' in a['url'] or '#' in a['url']:continue
   if 'pattern' not in a['text'].lower() or len(a['text'].strip())<20 or 'read more' in a['text'].lower():continue
   if '/tag/' in a['url'] or a['url'] in seen:continue
   seen.add(a['url']);tasks.append((provider,source,a['url']))
   if len(seen)==6:break
 def load(task):
  provider,source,url=task;html=fetch(url);m=Metadata();m.feed(html);links=Links();links.feed(html)
  title=m.title.strip() or m.meta.get('og:title','')
  if 'pattern' not in title.lower():raise ValueError(f'Not a pattern page: {url}: {title}')
  image=m.meta.get('og:image','') or next((im.get('src',im.get('data-src','')) for im in m.images if '/wp-content/uploads/' in im.get('src',im.get('data-src','')) and 'custom-logo' not in im.get('class','')),'')
  if not image:raise ValueError(f'No publisher preview: {url}')
  downloads=[a for a in links.links if '/product/' in a['url'] or '.pdf' in a['url'].lower() or 'download' in (a['text']+' '+a['url']).lower()]
  if not downloads and 'Subscribe &amp; Download' not in html:raise ValueError(f'No download path on {url}')
  id=provider+'-'+urlparse(url).path.rstrip('/').split('/')[-1]
  (ROOT/'work/library-sources'/f'{id}.html').write_text(html,encoding='utf-8')
  # Use publisher-provided responsive variants only; do not invent CDN transforms.
  variants=next((im.get('srcset',im.get('data-srcset','')) for im in m.images if im.get('src','').split('/')[-1].split('.')[0] in image and im.get('src')),'')
  return dict(id=id,name=title,description=m.meta.get('og:description',''),section=infer(title),tags=[],author=source,difficulty=None,image=image,image_srcset=variants,url=url,editor_url=None,examples=[],source=source,provider=provider,code_license=None,source_version=None,code_url=None,verified_on=date.today().isoformat(),integration='external',preview_kind='publisher',download_url=url if provider=='mood' else downloads[0]['url'],access='email-required' if provider=='mood' else 'publisher-download')
 with ThreadPoolExecutor(max_workers=4) as pool:extras=list(pool.map(load,tasks))
 data=json.loads((ROOT/'backend/app/drafts/library.json').read_text(encoding='utf-8'))
 data['items']=[dict(p,provider='freesewing') for p in data['items'] if p.get('source')=='FreeSewing']+extras
 data['sources']=[dict(id='freesewing',name='FreeSewing',url='https://freesewing.eu/designs/'),dict(id='mood',name='Mood Sewciety',url='https://blog.moodfabrics.com/category/free-sewing-patterns/'),dict(id='tiana',name='Tiana’s Closet',url='https://tianascloset.com/')]
 for path in ['backend/app/drafts/library.json','frontend/src/lib/fixtures/library.json']:(ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'{len(extras)} verified additional pattern pages; {len(data["items"])} total')
 for p in extras:print(p['id'],p['name'])
if __name__=='__main__':main()
