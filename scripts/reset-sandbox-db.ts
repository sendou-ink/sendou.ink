/** biome-ignore-all lint/suspicious/noConsole: Biome v2 migration */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
	const sandboxPath = path.join(__dirname, "..", "db-sandbox.sqlite3");
	const snapshotPath = path.join(__dirname, "..", "db-snapshot.sqlite3");

	if (!fs.existsSync(snapshotPath)) {
		console.error(`File ${snapshotPath} does not exist`);
		process.exit(1);
	}

	for (const suffix of ["-shm", "-wal", ""]) {
		fs.rmSync(`${sandboxPath}${suffix}`, { force: true });
	}

	fs.copyFileSync(snapshotPath, sandboxPath);
}

main();
