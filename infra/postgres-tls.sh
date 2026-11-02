#!/bin/sh
set -eu
# Private-network encryption; use verify-full with a trusted CA for managed DBs.
cert_dir=/var/lib/postgresql/tls
mkdir -p "$cert_dir"
if [ ! -s "$cert_dir/server.key" ]; then
    umask 077
    openssl req -new -x509 -nodes -days 3650 -subj '/CN=db' \
        -addext 'subjectAltName=DNS:db' -keyout "$cert_dir/server.key" -out "$cert_dir/server.crt"
fi
chown postgres:postgres "$cert_dir" "$cert_dir/server.key" "$cert_dir/server.crt"
chmod 600 "$cert_dir/server.key"
exec docker-entrypoint.sh postgres -c ssl=on \
    -c "ssl_cert_file=$cert_dir/server.crt" -c "ssl_key_file=$cert_dir/server.key"
