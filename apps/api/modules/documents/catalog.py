import json
from functools import lru_cache
from modules.core.resources import resource_path


@lru_cache(maxsize=1)
def document_catalog():
    catalog_path = resource_path('document-catalog.json')
    with catalog_path.open(encoding='utf-8') as catalog_file:
        return json.load(catalog_file)
