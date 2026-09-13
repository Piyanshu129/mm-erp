# Starts the local PostgreSQL server used for MM ERP development.
# Binaries live outside the repo at C:\Users\pisaini\pgsql16 (installed via
# the @embedded-postgres/windows-x64 npm package, since the network here
# blocks the official EnterpriseDB installer domain).
$PgHome = "C:\Users\pisaini\pgsql16"
& "$PgHome\bin\pg_ctl.exe" -D "$PgHome\data" -l "$PgHome\server.log" -o "-p 5432" start
