import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pathToDbFile = (file) => path.resolve(__dirname, "..", file);

const filesToDeleteIfExists = [
	"db.sqlite3",
	"db.sqlite3-shm",
	"db.sqlite3-wal",
];
for (const file of filesToDeleteIfExists) {
	try {
		fs.unlinkSync(pathToDbFile(file));
	} catch (err) {
		// if file doesn't exist err.code = ENOENT is thrown
		if (err.code !== "ENOENT") throw err;
	}
}
