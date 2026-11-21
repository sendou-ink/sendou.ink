/**
 * Builds `db-polish.sqlite3`, the database the polish skill's server runs on: the dev seed plus the
 * content stress rows of `stress.ts` (every user-entered text at the longest the forms accept) and the
 * states of `states.ts` (pages mid-match, mid-tournament, waitlisted...). Also writes the pages worth
 * visiting and the route list to `scripts/output/polish/`. Wipes the database it is pointed at, so any
 * other file is refused.
 *
 * pnpm run polish:db
 */
import fs from "node:fs";
import path from "node:path";
import { ensureMigratedDb } from "../ensure-test-db";
import { appRoutes } from "../living-docs/app-routes";

const POLISH_DB_FILE = "db-polish.sqlite3";
const OUTPUT_DIR = path.join("scripts", "output", "polish");

async function main() {
	const dbPath = process.env.DB_PATH;
	if (!dbPath || path.basename(dbPath) !== POLISH_DB_FILE) {
		throw new Error(
			`Refusing to wipe "${dbPath}": DB_PATH has to be ${POLISH_DB_FILE}`,
		);
	}

	ensureMigratedDb(dbPath);

	// the app db connection opens at import time from DB_PATH, which has to be migrated by then
	const { seed } = await import("~/db/seed");
	const { seedStress } = await import("./stress");
	const { seedStates } = await import("./states");
	const { logger } = await import("~/utils/logger");

	await seed();
	const stressTargets = await seedStress();
	const stateTargets = await seedStates();
	const targets = [...stressTargets, ...stateTargets];

	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	fs.writeFileSync(
		path.join(OUTPUT_DIR, "targets.json"),
		JSON.stringify(targets, null, "\t"),
	);
	fs.writeFileSync(
		path.join(OUTPUT_DIR, "routes.json"),
		JSON.stringify(pageRoutes(), null, "\t"),
	);

	logger.info(
		`${POLISH_DB_FILE} built: dev seed + ${stressTargets.length} content stress pages + ${stateTargets.length} pages in a scenario's state`,
	);
}

function pageRoutes() {
	return appRoutes()
		.filter((route) => route.hasComponent && !route.isLayout)
		.map((route) => ({ path: route.path, file: route.file }));
}

await main();
