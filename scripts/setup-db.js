// Used by setup.ps1: creates the app's database login and database (if they
// don't exist yet), connecting as the PostgreSQL superuser. Uses the `pg`
// driver that Prisma's own tooling doesn't provide, so it's installed on
// the fly next to this script's backend packages if missing.
const { execSync } = require("child_process");
const path = require("path");

const backendDir = path.join(__dirname, "..", "backend");
let Client;
try {
  ({ Client } = require(require.resolve("pg", { paths: [backendDir] })));
} catch {
  execSync("npm install --no-save --no-audit --no-fund pg", { cwd: backendDir, stdio: "inherit" });
  ({ Client } = require(require.resolve("pg", { paths: [backendDir] })));
}

const { PG_SUPER_PASSWORD, PG_PORT, APP_DB_USER, APP_DB_PASSWORD, APP_DB_NAME } = process.env;

(async () => {
  const client = new Client({
    host: "localhost",
    port: Number(PG_PORT),
    user: "postgres",
    password: PG_SUPER_PASSWORD.trim(),
    database: "postgres",
  });
  await client.connect();
  const ident = (s) => '"' + s.replace(/"/g, '""') + '"';
  const literal = (s) => "'" + s.replace(/'/g, "''") + "'";

  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_DB_USER]);
  if (role.rowCount === 0) {
    await client.query(`CREATE ROLE ${ident(APP_DB_USER)} LOGIN CREATEDB PASSWORD ${literal(APP_DB_PASSWORD)}`);
    console.log(`Created login ${APP_DB_USER}`);
  }
  const db = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [APP_DB_NAME]);
  if (db.rowCount === 0) {
    await client.query(`CREATE DATABASE ${ident(APP_DB_NAME)} OWNER ${ident(APP_DB_USER)}`);
    console.log(`Created database ${APP_DB_NAME}`);
  } else {
    console.log(`Database ${APP_DB_NAME} already exists`);
  }
  await client.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
