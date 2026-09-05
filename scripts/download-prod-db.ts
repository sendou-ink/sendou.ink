import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";
import zlib from "node:zlib";
import { format } from "date-fns";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_NAME = "sendou.ink";

const REMOTE_DB_PATH = "/var/data/db.sqlite3";
const REMOTE_SNAPSHOT_PATH = "/var/data/db-copy.sqlite3";

/** STRICT tables (3.37) set the floor, not VACUUM INTO (3.27). */
const MINIMUM_SQLITE_VERSION = { major: 3, minor: 37 };
/** Guards against a snapshot that is technically valid but obviously truncated. */
const MINIMUM_USER_COUNT = 10_000;

const DB_FILE_SUFFIXES = ["", "-shm", "-wal"];

const PROBE_SCRIPT = `
printf 'version=%s\\n' "$(sqlite3 --version | cut -d' ' -f1)"
if sqlite3 :memory: "CREATE VIRTUAL TABLE probe USING fts5(a)" >/dev/null 2>&1; then
	printf 'fts5=yes\\n'
else
	printf 'fts5=no\\n'
fi
printf 'dbBytes=%s\\n' "$(stat -c %s ${REMOTE_DB_PATH})"
printf 'freeBytes=%s\\n' "$(df -PB1 /var/data | awk 'NR==2 {print $4}')"
`;

const VACUUM_SCRIPT = `
set -e
rm -f ${REMOTE_SNAPSHOT_PATH}
sqlite3 -readonly ${REMOTE_DB_PATH} "VACUUM INTO '${REMOTE_SNAPSHOT_PATH}'"
stat -c %s ${REMOTE_SNAPSHOT_PATH}
`;

const DOWNLOAD_SCRIPT = `gzip -c ${REMOTE_SNAPSHOT_PATH}`;

const CLEANUP_SCRIPT = `rm -f ${REMOTE_SNAPSHOT_PATH}`;

async function main() {
	const options = parseArgs(process.argv.slice(2));

	loadEnv();

	const target = process.env.PROD_SSH_TARGET;
	if (!target) {
		throw new Error(
			"PROD_SSH_TARGET is not set. Add it to .env e.g. PROD_SSH_TARGET=srv-xxxxxxxx@ssh.frankfurt.render.com",
		);
	}

	const backupDir =
		process.env.PROD_DB_BACKUP_DIR || path.join(REPO_ROOT, "..", "backups");
	const checkouts = discoverCheckouts();
	const archivePath = path.join(
		backupDir,
		`db-${format(new Date(), "yyyyMMdd-HHmm")}.sqlite3.gz`,
	);

	log(`Target      ${target}`);
	log(`Archive     ${archivePath}`);
	log(
		`Checkouts   ${checkouts.map((checkout) => path.basename(checkout)).join(", ")}`,
	);
	log("");

	if (options.dryRun) {
		log("--dry-run, nothing will be run. Remote commands would be:");
		log(indent(PROBE_SCRIPT.trim()));
		log(indent(VACUUM_SCRIPT.trim()));
		log(indent(DOWNLOAD_SCRIPT));
		log(indent(CLEANUP_SCRIPT));
		return;
	}

	const probe = await probeRemote(target);
	log(
		`Production  ${formatBytes(probe.dbBytes)} (sqlite ${probe.version}, ${formatBytes(probe.freeBytes)} free on /var/data)`,
	);

	assertRemoteCanVacuum(probe);
	assertLocalSpace(backupDir, probe.dbBytes);

	log("");
	log(
		"Every checkout listed above loses its db-prod.sqlite3 and db-copy.sqlite3.",
	);
	log("Stop any `pnpm dev:prod` or benchmark holding one of them open first.");

	if (!options.yes && !(await confirm("Continue?"))) {
		log("Aborted.");
		return;
	}

	const startedAt = Date.now();

	log("");
	log("Vacuuming production database into a snapshot...");
	const snapshotBytes = Number(runRemote(target, VACUUM_SCRIPT).trim());
	log(`Snapshot    ${formatBytes(snapshotBytes)}`);

	try {
		fs.mkdirSync(backupDir, { recursive: true });
		await downloadSnapshot({ target, archivePath });
	} finally {
		removeRemoteSnapshot(target);
	}

	const stagedPath = path.join(REPO_ROOT, "db-copy.sqlite3.new");
	try {
		log("Decompressing...");
		await decompress(archivePath, stagedPath);
		verifySnapshot(stagedPath);
	} catch (error) {
		fs.rmSync(stagedPath, { force: true });
		throw new Error(
			`Snapshot failed verification, no checkout was touched. The archive is kept at ${archivePath}\n${(error as Error).message}`,
		);
	}

	distribute({ checkouts, stagedPath });

	log("");
	log("Rebuilding db-prod.sqlite3 in this checkout...");
	const refresh = spawnSync("pnpm", ["run", "refresh-prod-db"], {
		cwd: REPO_ROOT,
		stdio: "inherit",
	});
	if (refresh.status !== 0) {
		throw new Error("pnpm run refresh-prod-db failed");
	}

	if (typeof options.keep === "number") {
		pruneArchives(backupDir, options.keep);
	}

	log("");
	log(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
	log(`Archives    ${formatBytes(directorySize(backupDir))} in ${backupDir}`);
}

function parseArgs(args: string[]) {
	const { values } = parseNodeArgs({
		// `pnpm run download-prod-db -- --dry-run` forwards the separator verbatim
		args: args[0] === "--" ? args.slice(1) : args,
		options: {
			"dry-run": { type: "boolean" },
			yes: { type: "boolean" },
			keep: { type: "string" },
		},
	});

	const keep = values.keep === undefined ? undefined : Number(values.keep);

	if (keep !== undefined && (!Number.isInteger(keep) || keep < 1)) {
		throw new Error("--keep expects a positive integer e.g. --keep 3");
	}

	return {
		dryRun: values["dry-run"] === true,
		yes: values.yes === true,
		keep,
	};
}

function loadEnv() {
	try {
		process.loadEnvFile(path.join(REPO_ROOT, ".env"));
	} catch {
		// .env is optional, the target can also come from the environment
	}
}

/** Sibling directories of this checkout that are also sendou.ink checkouts. */
function discoverCheckouts() {
	const parent = path.join(REPO_ROOT, "..");

	const checkouts = fs
		.readdirSync(parent, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(parent, entry.name))
		.filter(isCheckout);

	if (!checkouts.includes(path.resolve(REPO_ROOT))) {
		checkouts.push(path.resolve(REPO_ROOT));
	}

	return checkouts;
}

function isCheckout(directory: string) {
	try {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(directory, "package.json"), "utf8"),
		) as { name?: string };

		return packageJson.name === PACKAGE_NAME;
	} catch {
		return false;
	}
}

async function probeRemote(target: string) {
	const output = runRemote(target, PROBE_SCRIPT);
	const values = new Map(
		output
			.split("\n")
			.filter(Boolean)
			.map((line) => line.split("=") as [string, string]),
	);

	return {
		version: values.get("version") ?? "unknown",
		hasFts5: values.get("fts5") === "yes",
		dbBytes: Number(values.get("dbBytes")),
		freeBytes: Number(values.get("freeBytes")),
	};
}

/**
 * VACUUM INTO reparses the whole schema, so the remote sqlite3 has to understand
 * everything in it: STRICT tables and the UserSearch fts5 virtual table.
 */
function assertRemoteCanVacuum(probe: {
	version: string;
	hasFts5: boolean;
	dbBytes: number;
	freeBytes: number;
}) {
	const [major, minor] = probe.version.split(".").map(Number);
	const tooOld =
		major < MINIMUM_SQLITE_VERSION.major ||
		(major === MINIMUM_SQLITE_VERSION.major &&
			minor < MINIMUM_SQLITE_VERSION.minor);

	if (Number.isNaN(major) || tooOld) {
		throw new Error(
			`Remote sqlite3 is ${probe.version}, need at least ${MINIMUM_SQLITE_VERSION.major}.${MINIMUM_SQLITE_VERSION.minor} for STRICT tables`,
		);
	}

	if (!probe.hasFts5) {
		throw new Error(
			"Remote sqlite3 was built without fts5, it cannot vacuum a database containing the UserSearch table",
		);
	}

	if (probe.freeBytes < probe.dbBytes) {
		throw new Error(
			`/var/data has ${formatBytes(probe.freeBytes)} free, the snapshot needs up to ${formatBytes(probe.dbBytes)}`,
		);
	}
}

function assertLocalSpace(backupDir: string, dbBytes: number) {
	const { bsize, bavail } = fs.statfsSync(
		fs.existsSync(backupDir) ? backupDir : REPO_ROOT,
	);
	const free = bsize * bavail;
	const needed = dbBytes * 1.5;

	if (free < needed) {
		throw new Error(
			`${formatBytes(free)} free locally, need roughly ${formatBytes(needed)} for the archive and the new copy`,
		);
	}
}

async function downloadSnapshot({
	target,
	archivePath,
}: {
	target: string;
	archivePath: string;
}) {
	const partPath = `${archivePath}.part`;
	const child = spawn("ssh", [target, "sh", "-s"], {
		stdio: ["pipe", "pipe", "pipe"],
	});
	// has to be attached before the pipeline is awaited, the child may already be gone by then
	const exited = new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});
	child.stdin.end(DOWNLOAD_SCRIPT);

	let stderr = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});

	let downloaded = 0;
	const counter = new Transform({
		transform(chunk, _encoding, callback) {
			downloaded += chunk.length;
			callback(null, chunk);
		},
	});

	const startedAt = Date.now();
	const progress = setInterval(() => {
		const seconds = (Date.now() - startedAt) / 1000;
		writeProgress(
			`Downloading ${formatBytes(downloaded)} (${formatBytes(downloaded / seconds)}/s)`,
		);
	}, 1000);

	try {
		await pipeline(child.stdout, counter, fs.createWriteStream(partPath));
	} finally {
		clearInterval(progress);
		writeProgress("");
	}

	const exitCode = await exited;
	if (exitCode !== 0) {
		fs.rmSync(partPath, { force: true });
		throw new Error(`Download failed (ssh exited ${exitCode})\n${stderr}`);
	}

	fs.renameSync(partPath, archivePath);
	log(`Downloaded  ${formatBytes(downloaded)} to ${archivePath}`);
}

async function decompress(archivePath: string, destinationPath: string) {
	await pipeline(
		fs.createReadStream(archivePath),
		zlib.createGunzip(),
		fs.createWriteStream(destinationPath),
	);
}

function verifySnapshot(snapshotPath: string) {
	const database = new DatabaseSync(snapshotPath, { readOnly: true });

	try {
		const check = database.prepare("PRAGMA quick_check").get() as {
			quick_check: string;
		};
		if (check.quick_check !== "ok") {
			throw new Error(`quick_check returned "${check.quick_check}"`);
		}

		const { count } = database
			.prepare('SELECT count(*) as count FROM "User"')
			.get() as { count: number };
		if (count < MINIMUM_USER_COUNT) {
			throw new Error(
				`only ${count} users, expected at least ${MINIMUM_USER_COUNT}`,
			);
		}

		const { count: searchCount } = database
			.prepare('SELECT count(*) as count FROM "UserSearch"')
			.get() as { count: number };
		if (searchCount < MINIMUM_USER_COUNT) {
			throw new Error(
				`UserSearch has only ${searchCount} rows, its fts5 content did not survive the vacuum`,
			);
		}

		log(`Verified    ${count.toLocaleString("en-US")} users`);
	} finally {
		database.close();
		// a read-only open cannot clean these up itself
		for (const suffix of ["-shm", "-wal"]) {
			fs.rmSync(`${snapshotPath}${suffix}`, { force: true });
		}
	}
}

function distribute({
	checkouts,
	stagedPath,
}: {
	checkouts: string[];
	stagedPath: string;
}) {
	for (const checkout of checkouts) {
		for (const name of ["db-prod.sqlite3", "db-copy.sqlite3"]) {
			for (const suffix of DB_FILE_SUFFIXES) {
				fs.rmSync(path.join(checkout, `${name}${suffix}`), { force: true });
			}
		}
	}

	const copyPath = path.join(REPO_ROOT, "db-copy.sqlite3");
	fs.renameSync(stagedPath, copyPath);

	for (const checkout of checkouts) {
		const destination = path.join(checkout, "db-copy.sqlite3");
		if (destination !== copyPath) {
			fs.copyFileSync(copyPath, destination);
		}
		log(`Copied      ${destination}`);
	}
}

function pruneArchives(backupDir: string, keep: number) {
	const archives = fs
		.readdirSync(backupDir)
		.filter((name) => name.endsWith(".sqlite3.gz"))
		.sort()
		.reverse()
		.slice(keep);

	for (const name of archives) {
		fs.rmSync(path.join(backupDir, name));
		log(`Pruned      ${name}`);
	}
}

function directorySize(directory: string) {
	return fs
		.readdirSync(directory)
		.map((name) => fs.statSync(path.join(directory, name)).size)
		.reduce((total, size) => total + size, 0);
}

async function confirm(question: string) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const answer = await rl.question(`${question} [y/N] `);
	rl.close();

	return answer.trim().toLowerCase() === "y";
}

function removeRemoteSnapshot(target: string) {
	try {
		runRemote(target, CLEANUP_SCRIPT);
	} catch {
		log(
			`Could not remove ${REMOTE_SNAPSHOT_PATH} on the server, delete it by hand`,
		);
	}
}

function runRemote(target: string, script: string) {
	const result = spawnSync("ssh", [target, "sh", "-s"], {
		input: script,
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
	});

	if (result.status !== 0) {
		throw new Error(
			`ssh ${target} failed (exit ${result.status})\n${result.stderr}`,
		);
	}

	return result.stdout;
}

function formatBytes(bytes: number) {
	const gigabytes = bytes / 1024 ** 3;
	if (gigabytes >= 1) return `${gigabytes.toFixed(2)} GB`;

	return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function indent(text: string) {
	return text
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
}

function writeProgress(message: string) {
	if (!process.stdout.isTTY) return;

	process.stdout.write(`\r${message.padEnd(60)}`);
	if (!message) process.stdout.write("\r");
}

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}

main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error((error as Error).message);
	process.exit(1);
});
