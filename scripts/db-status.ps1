# Checks whether the local PostgreSQL server is running.
$PgHome = "C:\Users\pisaini\pgsql16"
& "$PgHome\bin\pg_ctl.exe" -D "$PgHome\data" status
