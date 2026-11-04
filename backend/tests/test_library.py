import json
from pathlib import Path
from urllib.parse import urlparse,unquote
from fastapi.testclient import TestClient
from app.main import app
from app.drafts.library import LIBRARY


def test_official_library_api_and_frontend_snapshot():
    response=TestClient(app).get('/api/library')
    assert response.status_code==200
    assert response.json()==LIBRARY
    assert LIBRARY['kind']=='official-source-catalog'
    root=Path(__file__).resolve().parents[2]
    assert json.loads((root/'frontend/src/lib/fixtures/library.json').read_text(encoding='utf-8'))==LIBRARY


def test_every_entry_points_to_its_real_upstream_design_and_examples():
    items=LIBRARY['items']
    assert len(items)==85
    assert {p['provider'] for p in items}=={'freesewing','mood','tiana'}
    assert len({p['id'] for p in items})==len(items)
    for item in items:
        assert item['integration']=='external'
        assert 'params' not in item and 'model' not in item
        assert item['author'] and item['name']
        if item['provider']=='freesewing':
            assert item['url']==f"https://freesewing.eu/designs/{item['id']}/"
            assert 0<=item['difficulty']<=5
            settings=json.loads(unquote(urlparse(item['editor_url']).fragment)[2:])
            assert settings['design']==item['id']
            assert urlparse(item['image']).hostname=='cdn.freesewing.eu'
        else:
            assert item['difficulty'] is None and item['code_license'] is None
            assert item['download_url'].startswith('https://')
            assert urlparse(item['url']).hostname in {'blog.moodfabrics.com','tianascloset.com'}
            assert item['editor_url'] is None
        seen=set()
        for example in item['examples']:
            assert urlparse(example['url']).hostname=='freesewing.eu'
            assert urlparse(example['url']).path.startswith('/showcase/')
            assert urlparse(example['image']).hostname=='cdn.freesewing.eu'
            assert example['title'] and example['url'] not in seen
            seen.add(example['url'])
