#!/bin/sh
set -eu
# Private-network encryption; use verify-full with a trusted CA for managed DBs.
cert_dir=/var/lib/postgresql/tls
tls_name=${STRATINO_DB_TLS_NAME:-db}
case "$tls_name" in
    ''|*[!a-zA-Z0-9.-]*) echo 'Invalid database TLS hostname' >&2; exit 2 ;;
esac
mkdir -p "$cert_dir"
if [ ! -s "$cert_dir/server.key" ]; then
    umask 077
    openssl req -new -x509 -nodes -days 3650 -subj "/CN=$tls_name" \
        -addext "subjectAltName=DNS:$tls_name" -keyout "$cert_dir/server.key" -out "$cert_dir/server.crt"
fi
chown postgres:postgres "$cert_dir" "$cert_dir/server.key" "$cert_dir/server.crt"
chmod 600 "$cert_dir/server.key"
chmod 644 "$cert_dir/server.crt"
exec docker-entrypoint.sh postgres -c ssl=on \
    -c "ssl_cert_file=$cert_dir/server.crt" -c "ssl_key_file=$cert_dir/server.key" \
    -c "shared_buffers=${STRATINO_DB_SHARED_BUFFERS:-128MB}" \
    -c "max_connections=${STRATINO_DB_MAX_CONNECTIONS:-100}"
