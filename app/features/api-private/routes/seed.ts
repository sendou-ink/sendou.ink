import fs from "node:fs";
import path from "node:path";
import type { ActionFunction } from "react-router";
import { z } from "zod";
import { sql } from "~/db/sql";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { SEED_VARIATIONS } from "~/features/api-private/constants";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { cache } from "~/utils/cache.server";
import { parseRequestPayload } from "~/utils/remix.server";

const E2E_SEEDS_DIR = "e2e/seeds";

const seedSchema = z.object({
	variation: z.enum(SEED_VARIATIONS).nullish(),
	source: z.enum(["e2e"]).nullish(),
});

export type SeedVariation = NonNullable<
	z.infer<typeof seedSchema>["variation"]
>;

export const action: ActionFunction = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const { variation, source } = await parseRequestPayload({
		request,
		schema: seedSchema,
	});

	const variationName = variation ?? "DEFAULT";
	const preSeededDbPath = path.join(
		E2E_SEEDS_DIR,
		`db-seed-${variationName}.sqlite3`,
	);

	const usePreSeeded = source === "e2e" && fs.existsSync(preSeededDbPath);

	if (usePreSeeded) {
		restoreFromPreSeeded(preSeededDbPath);
		adjustSeedDatesToCurrent(variationName);
	} else {
		const { seed } = await import("~/db/seed");
		await seed(variation);
	}

	clearAllTournamentDataCache();
	cache.clear();
	await refreshBannedCache();
	await refreshSendouQInstance();

	return Response.json(null);
};

const REG_OPEN_TOURNAMENT_IDS = [1, 3];

const SEED_REFERENCE_TIMESTAMP = 1767440151;

// TODO: do this cleaner
function adjustSeedDatesToCurrent(variation: SeedVariation) {
	const halfAnHourFromNow = Math.floor((Date.now() + 1000 * 60 * 30) / 1000);
	const oneHourAgo = Math.floor((Date.now() - 1000 * 60 * 60) / 1000);
	const now = Math.floor(Date.now() / 1000);

	const tournamentEventIds = sql
		.prepare(
			`SELECT id, tournamentId FROM "CalendarEvent" WHERE tournamentId IS NOT NULL`,
		)
		.all() as Array<{ id: number; tournamentId: number }>;

	for (const { id, tournamentId } of tournamentEventIds) {
		const isRegOpen =
			variation === "REG_OPEN" &&
			REG_OPEN_TOURNAMENT_IDS.includes(tournamentId);

		sql
			.prepare(`UPDATE "CalendarEventDate" SET startTime = ? WHERE eventId = ?`)
			.run(isRegOpen ? halfAnHourFromNow : oneHourAgo, id);
	}

	sql
		.prepare(
			`UPDATE "Group" SET latestActionAt = ?, createdAt = ? WHERE status != 'INACTIVE'`,
		)
		.run(now, now);

	sql.prepare(`UPDATE "GroupLike" SET createdAt = ?`).run(now);

	const scrimTimeOffset = now - SEED_REFERENCE_TIMESTAMP;
	sql
		.prepare(
			`UPDATE "ScrimPost" SET "at" = "at" + ?, "createdAt" = "createdAt" + ?`,
		)
		.run(scrimTimeOffset, scrimTimeOffset);
	sql
		.prepare(
			`UPDATE "ScrimPost" SET "rangeEnd" = "rangeEnd" + ? WHERE "rangeEnd" IS NOT NULL`,
		)
		.run(scrimTimeOffset);
	sql
		.prepare(
			`UPDATE "ScrimPostRequest" SET "at" = "at" + ? WHERE "at" IS NOT NULL`,
		)
		.run(scrimTimeOffset);
}

function restoreFromPreSeeded(sourcePath: string) {
	sql.exec(`ATTACH DATABASE '${sourcePath}' AS source`);

	try {
		const tables = sql
			.prepare(
				"SELECT name FROM source.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
			)
			.all() as Array<{ name: string }>;

		sql.exec("PRAGMA foreign_keys = OFF");

		for (const { name } of tables) {
			sql.exec(`DELETE FROM main."${name}"`);

			// Get non-generated columns from main database
			const mainColumns = sql
				.prepare(`PRAGMA main.table_xinfo("${name}")`)
				.all() as Array<{ name: string; hidden: number }>;

			// Get columns from source database
			const sourceColumns = sql
				.prepare(`PRAGMA source.table_info("${name}")`)
				.all() as Array<{ name: string }>;

			const sourceColumnNames = new Set(sourceColumns.map((c) => c.name));

			// hidden = 2 or 3 means virtual/stored generated column
			// Only include columns that exist in both databases
			const nonGeneratedCols = mainColumns
				.filter((c) => c.hidden === 0 && sourceColumnNames.has(c.name))
				.map((c) => c.name);

			if (nonGeneratedCols.length > 0) {
				const colList = nonGeneratedCols.map((c) => `"${c}"`).join(", ");
				sql.exec(
					`INSERT INTO main."${name}" (${colList}) SELECT ${colList} FROM source."${name}"`,
				);
			}
		}

		sql.exec("PRAGMA foreign_keys = ON");
	} finally {
		sql.exec("DETACH DATABASE source");
	}
}
