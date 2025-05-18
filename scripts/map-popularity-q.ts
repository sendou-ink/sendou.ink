import "dotenv/config";
import { db } from "~/db/sql";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { modesShort, stageIds } from "~/modules/in-game-lists";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { logger } from "~/utils/logger";
import names from "../locales/en/game-misc.json";

const SEASON_2_START = new Date("2023-12-04T17:00:00.000Z");

async function main() {
	const appearance = await db
		.selectFrom("GroupMatchMap")
		.innerJoin("GroupMatch", "GroupMatchMap.matchId", "GroupMatch.id")
		.select(({ fn }) => [
			"GroupMatchMap.mode",
			"GroupMatchMap.stageId",
			fn.countAll<number>().as("count"),
		])
		.groupBy(["GroupMatchMap.stageId", "GroupMatchMap.mode"])
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(SEASON_2_START))
		.execute();

	const usage: Record<
		ModeShort | "ALL",
		{ stageId: StageId; count: number }[]
	> = {
		TW: [],
		SZ: [],
		TC: [],
		RM: [],
		CB: [],
		ALL: [],
	};

	const ageRow = await db
		.selectFrom("Build")
		.select((eb) => eb.fn.max("Build.updatedAt").as("age"))
		.executeTakeFirstOrThrow();

	const dbAgeDate = databaseTimestampToDate(ageRow.age);

	for (const mode of modesShort) {
		for (const stageId of stageIds) {
			const count =
				appearance.find((row) => row.stageId === stageId && row.mode === mode)
					?.count ?? 0;

			usage[mode].push({
				stageId,
				count,
			});

			const existingAllCount = usage.ALL.find((row) => row.stageId === stageId);

			if (!existingAllCount) {
				usage.ALL.push({
					stageId,
					count,
				});
			} else {
				existingAllCount.count += count;
			}
		}

		usage[mode].sort((a, b) => b.count - a.count);
	}

	usage.ALL.sort((a, b) => b.count - a.count);

	logger.info(`DB Age: ${dbAgeDate.toISOString()}\n`);

	// all modes

	logger.info("All");
	let banCount = 0;
	for (const [i, { stageId, count }] of usage.ALL.entries()) {
		const name = names[`STAGE_${stageId}`];

		const partlyBanned = Object.values(BANNED_MAPS).some((arr) =>
			arr.includes(stageId as any),
		);

		if (partlyBanned) banCount++;

		logger.info(
			`${i < 9 ? " " : ""}${i + 1}) ${
				partlyBanned ? "🔴" : "  "
			} ${name}: ${count}`,
		);
	}

	logger.info(`Banned maps (at least one mode): ${banCount}`);
	logger.info();

	// modes
	for (const mode of modesShort) {
		// if (usage[mode].every((e) => e.count === 0)) continue;

		logger.info(mode);
		let banCount = 0;
		for (const [i, { stageId, count }] of usage[mode].entries()) {
			const name = names[`STAGE_${stageId}`];

			const isBanned = BANNED_MAPS[mode].includes(stageId);
			if (isBanned) banCount++;

			logger.info(
				`${i < 9 ? " " : ""}${i + 1}) ${
					isBanned ? "❌" : "  "
				} ${name}: ${count}`,
			);
		}

		logger.info(`Banned maps: ${banCount}`);
		logger.info(
			Object.values(usage[mode]).reduce((acc, cur) => acc + cur.count, 0),
		);
	}
}

void main();
