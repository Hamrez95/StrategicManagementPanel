# Infrastructure boundary

Development services and provider-neutral deployment belong here (STR-008/009/037). No cloud resources are provisioned. Serve public pages and the authenticated app behind one origin, forward `/api/` to Django and allow SPA fallback only for non-API navigation; API/file failures must never return the public index HTML.
