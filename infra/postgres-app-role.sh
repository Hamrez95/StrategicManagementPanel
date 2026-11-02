#!/bin/sh
set -eu
# PostgreSQL runs this only for an empty data volume. The API never uses the
# cluster-admin credentials. psql quotes identifiers/passwords as SQL values.
psql --no-psqlrc --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_user STRATINO_DB_APP_USER
\getenv app_password STRATINO_DB_APP_PASSWORD
SELECT current_database() AS database_name \gset
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"database_name" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
