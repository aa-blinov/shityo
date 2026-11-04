"""Import official catalog metadata and existing showcase links, never invent designs.

Run with --metadata-root pointing at the upstream FreeSewing designs directory.
Photos remain on the original CDN; no photographs are copied into this repository.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://freesewing.eu'


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent':'Shityo catalog source verification'}), timeout=40) as response:
        return response.read().decode('utf-8')


def image(style):
    match = re.search(r'url\(["\x27]?(.*?)["\x27]?\)', style)
    return match[1] if match else ''


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]; self.link=None; self.button=None; self.buttons=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='a':
            self.link={'url':urljoin(ORIGIN,attrs.get('href','')),'title':attrs.get('title',''),'text':'','image':image(attrs.get('style',''))}
        if self.link and attrs.get('style') and not self.link['image']:
            self.link['image']=image(attrs['style'])
        if tag=='button': self.button=''
    def handle_data(self,text):
        if self.link is not None:self.link['text']+=text
        if self.button is not None:self.button+=text
    def handle_endtag(self,tag):
        if tag=='a' and self.link is not None:self.links.append(self.link);self.link=None
        if tag=='button' and self.button is not None:self.buttons.append(self.button);self.button=None


def section(id,tags):
    if id in ['bob','otis']:return 'kids'
    for tag,result in [('blocks','blocks'),('dresses','dresses'),('onePiece','dresses'),('skirts','skirts'),('coats','outerwear'),('swimwear','underwear'),('underwear','underwear'),('bottoms','bottoms'),('accessories','accessories'),('costumes','costumes'),('historical','costumes')]:
        if tag in tags:return result
    return 'dresses' if id=='sophie' else 'tops'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--metadata-root',type=Path,required=True)
    args=parser.parse_args()
    index=Links();index.feed(fetch(ORIGIN+'/designs/'))
    listed=[link for link in index.links if link['title'].startswith('A FreeSewing') and link['url'].rstrip('/').split('/')[-1]!='library']
    cache=ROOT/'work/library-sources';cache.mkdir(parents=True,exist_ok=True)
    def load(link):
        id=link['url'].rstrip('/').split('/')[-1]
        about=json.loads((args.metadata_root/id/'about.json').read_text(encoding='utf-8'))
        html=fetch(link['url']);(cache/f'{id}.html').write_text(html,encoding='utf-8')
        page=Links();page.feed(html)
        examples=[{'title':a['title'],'url':a['url'],'image':a['image']} for a in page.links if '/showcase/' in a['url'] and '/tags/' not in a['url'] and a['title'] and a['image']][:3]
        editor=next((a['url'] for a in page.links if '/editor/#' in a['url']),None)
        authors=[b[len('design'):].strip() for b in page.buttons if b.startswith('design')]
        author=authors[0] if authors else about['design']
        if isinstance(author,list):author=', '.join(author)
        return {'id':id,'name':link['text'].strip(),'description':link['title'],
            'section':section(id,about['tags']),'tags':about['tags'],'author':author,
            'difficulty':about['difficulty'],'image':link['image'],'url':link['url'],
            'editor_url':editor,'examples':examples,'source':'FreeSewing',
            'code_license':'MIT','source_version':about['version'],
            'code_url':f'https://codeberg.org/freesewing/freesewing/src/branch/develop/designs/{id}',
            'verified_on':date.today().isoformat(),'integration':'external'}
    with ThreadPoolExecutor(max_workers=4) as pool:items=list(pool.map(load,listed))
    result={'version':2,'kind':'official-source-catalog','source_url':ORIGIN+'/designs/','items':items}
    for target in ['backend/app/drafts/library.json','frontend/src/lib/fixtures/library.json']:
        (ROOT/target).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{len(items)} official designs, {sum(len(p["examples"]) for p in items)} showcase examples')


if __name__=='__main__':main()
