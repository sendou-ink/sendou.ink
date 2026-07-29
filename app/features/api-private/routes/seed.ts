import fs from "node:fs";
import path from "node:path";
import { startOfToday, subHours } from "date-fns";
import { sql } from "kysely";
import type { ActionFunction } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { refreshTentativeTiersCache } from "~/features/tournament-organization/core/tentativeTiers.server";
import { cache } from "~/utils/cache.server";
import { parseRequestPayload } from "~/utils/remix.server";

const E2E_SEEDS_DIR = "e2e/seeds";
const PRE_SEEDED_DB_PATH = path.join(E2E_SEEDS_DIR, "db-seed.sqlite3");

const seedSchema = z.object({
	source: z.enum(["e2e"]).nullish(),
});

export const action: ActionFunction = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const { source } = await parseRequestPayload({
		request,
		schema: seedSchema,
	});

	const usePreSeeded = source === "e2e" && fs.existsSync(PRE_SEEDED_DB_PATH);

	if (usePreSeeded) {
		await restoreFromPreSeeded(PRE_SEEDED_DB_PATH);
		await adjustSeedDatesToCurrent();
	} else {
		const { seed } = await import("~/db/seed");
		await seed();
	}

	clearAllTournamentDataCache();
	cache.clear();
	await refreshBannedCache();
	await refreshSendouQInstance();
	await refreshTentativeTiersCache();
	await refreshApiTokensCache();

	return Response.json(null);
};

const SEED_REFERENCE_TIMESTAMP = 1767440151;

// xxx: do this cleaner, we now have backdate so why not used?
async function adjustSeedDatesToCurrent() {
	// clamped to the start of today so that within the first hour after midnight
	// the event does not fall onto the previous calendar day (calendar renders today onward)
	const oneHourAgo = Math.floor(
		Math.max(subHours(new Date(), 1).getTime(), startOfToday().getTime()) /
			1000,
	);
	const now = Math.floor(Date.now() / 1000);

	const tournamentEventIds = await db
		.selectFrom("CalendarEvent")
		.select(["id"])
		.where("tournamentId", "is not", null)
		.execute();

	for (const { id } of tournamentEventIds) {
		await db
			.updateTable("CalendarEventDate")
			.set({ startsAt: oneHourAgo })
			.where("eventId", "=", id)
			.execute();
	}

	await db
		.updateTable("Group")
		.set({ latestActionAt: now, createdAt: now })
		.where("status", "!=", "INACTIVE")
		.execute();

	await db.updateTable("GroupLike").set({ createdAt: now }).execute();

	const scrimTimeOffset = now - SEED_REFERENCE_TIMESTAMP;
	await db
		.updateTable("ScrimPost")
		.set((eb) => ({
			startsAt: eb("startsAt", "+", scrimTimeOffset),
			createdAt: eb("createdAt", "+", scrimTimeOffset),
		}))
		.execute();
	await db
		.updateTable("ScrimPost")
		.set((eb) => ({ rangeEndsAt: eb("rangeEndsAt", "+", scrimTimeOffset) }))
		.where("rangeEndsAt", "is not", null)
		.execute();
	await db
		.updateTable("ScrimPostRequest")
		.set((eb) => ({ startsAt: eb("startsAt", "+", scrimTimeOffset) }))
		.where("startsAt", "is not", null)
		.execute();
}

async function restoreFromPreSeeded(sourcePath: string) {
	await sql`ATTACH DATABASE ${sourcePath} AS source`.execute(db);

	try {
		// virtual tables and their shadow tables (e.g. UserSearch_data) can not be
		// written to directly; the fts index stays in sync via the User triggers
		// when its source rows are deleted and re-inserted below
		const { rows: tables } = await sql<{ name: string }>`
			SELECT name FROM source.sqlite_master
			WHERE type='table'
			AND name NOT LIKE 'sqlite_%'
			AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'
			AND NOT EXISTS (
				SELECT 1 FROM source.sqlite_master AS vt
				WHERE vt.sql LIKE 'CREATE VIRTUAL TABLE%'
				AND source.sqlite_master.name LIKE vt.name || '_%'
			)
		`.execute(db);

		await sql`PRAGMA foreign_keys = OFF`.execute(db);

		for (const { name } of tables) {
			await sql`DELETE FROM ${sql.table(`main.${name}`)}`.execute(db);

			// Get non-generated columns from main database
			const { rows: mainColumns } = await sql<{
				name: string;
				hidden: number;
			}>`PRAGMA main.table_xinfo(${sql.ref(name)})`.execute(db);

			// Get columns from source database
			const { rows: sourceColumns } = await sql<{
				name: string;
			}>`PRAGMA source.table_info(${sql.ref(name)})`.execute(db);

			const sourceColumnNames = new Set(sourceColumns.map((c) => c.name));

			// hidden = 2 or 3 means virtual/stored generated column
			// Only include columns that exist in both databases
			const nonGeneratedCols = mainColumns
				.filter((c) => c.hidden === 0 && sourceColumnNames.has(c.name))
				.map((c) => sql.ref(c.name));

			if (nonGeneratedCols.length > 0) {
				const colList = sql.join(nonGeneratedCols);
				await sql`INSERT INTO ${sql.table(`main.${name}`)} (${colList}) SELECT ${colList} FROM ${sql.table(`source.${name}`)}`.execute(
					db,
				);
			}
		}

		await sql`PRAGMA foreign_keys = ON`.execute(db);
	} finally {
		await sql`DETACH DATABASE source`.execute(db);
	}
}
