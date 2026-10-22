const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
input: process.stdin,
output: process.stdout,
terminal: true,
});

rl.question("Enter your new owner password: ", (password) => {
if (!password || password.length < 12) {
console.error("Password must be at least 12 characters.");
rl.close();
process.exitCode = 1;
return;
}

const hash = bcrypt.hashSync(password, 12);
console.log("\nOWNER_PASSWORD_HASH:\n" + hash);
rl.close();
});
