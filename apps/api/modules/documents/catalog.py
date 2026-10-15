import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def document_catalog():
    catalog_path = Path(__file__).resolve().parents[3] / 'src' / 'document-catalog.json'
    with catalog_path.open(encoding='utf-8') as catalog_file:
        return json.load(catalog_file)
