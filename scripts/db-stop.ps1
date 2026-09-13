# Stops the local PostgreSQL server used for MM ERP development.
$PgHome = "C:\Users\pisaini\pgsql16"
& "$PgHome\bin\pg_ctl.exe" -D "$PgHome\data" stop -m fast
