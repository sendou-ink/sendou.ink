import fs from "node:fs";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import path from "node:path";

function main() {
	const dbProdPath = path.join(__dirname, "..", "db-prod.sqlite3");
	const dbProdShmPath = path.join(__dirname, "..", "db-prod.sqlite3-shm");
	const dbProdWalPath = path.join(__dirname, "..", "db-prod.sqlite3-wal");
	const dbCopyPath = path.join(__dirname, "..", "db-copy.sqlite3");

	if (!fs.existsSync(dbCopyPath)) {
		console.error(`File ${dbCopyPath} does not exist`);
		process.exit(1);
	}

	// delete db-prod.sqlite3-shm file if exists
	if (fs.existsSync(dbProdShmPath)) {
		fs.unlinkSync(dbProdShmPath);
	}

	// delete db-prod.sqlite3-wal file if exists
	if (fs.existsSync(dbProdWalPath)) {
		fs.unlinkSync(dbProdWalPath);
	}

	// delete db-prod.sqlite3 if exists
	if (fs.existsSync(dbProdPath)) {
		fs.unlinkSync(dbProdPath);
	}

	// copy db-copy.sqlite3 to db-prod.sqlite3
	fs.copyFileSync(dbCopyPath, dbProdPath);
}

main();
