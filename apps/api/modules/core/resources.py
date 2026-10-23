from pathlib import Path


API_RESOURCES = Path(__file__).resolve().parents[2] / 'resources'
ALLOWED_RESOURCES = frozenset({'document-catalog.json', 'fixtures/efe-ife.json', 'fixtures/contribution-margin.json'})


def resource_path(name):
    """Resolve only build-packaged reference artifacts, independently of repository depth."""
    if name not in ALLOWED_RESOURCES:
        raise ValueError('Unknown packaged resource.')
    return API_RESOURCES / name
