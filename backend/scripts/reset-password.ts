// Sets a new password for a login, run on the server PC (reset-password.bat
// in the MM folder). For when an admin has forgotten their own password and
// so can't reset it from the Users page. Asks for the email and the new
// password; signs that login out everywhere.
import "dotenv/config";
import readline from "readline";
import { prisma } from "../src/lib/prisma";
import { setPassword } from "../src/modules/users/users.service";

// Answers are queued as lines arrive, so this works whether they're typed
// one at a time or arrive all at once.
const rl = readline.createInterface({ input: process.stdin });
const lines: string[] = [];
let waiting: ((line: string) => void) | null = null;
rl.on("line", (line) => {
  if (waiting) {
    const w = waiting;
    waiting = null;
    w(line.trim());
  } else lines.push(line.trim());
});
function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const queued = lines.shift();
  if (queued !== undefined) {
    process.stdout.write("\n");
    return Promise.resolve(queued);
  }
  return new Promise((resolve) => (waiting = resolve));
}

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { role: true },
    orderBy: { id: "asc" },
  });
  console.log("Logins on this system:");
  for (const u of users) console.log(`  ${u.email}  (${u.name}, ${u.role.name}${u.isActive ? "" : ", disabled"})`);
  console.log("");

  const email = await ask("Email of the login to reset: ");
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No login with email ${email}.`);
    process.exit(1);
  }
  const password = await ask("New password (at least 8 characters): ");
  await setPassword(user.id, password);
  if (!user.isActive) await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  console.log(`\nDone — ${user.email} can now log in with the new password.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
    return prisma.$disconnect();
  });
