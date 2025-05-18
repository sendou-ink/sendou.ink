import "dotenv/config";
import { db } from "~/db/sql";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { modesShort, stageIds } from "~/modules/in-game-lists";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { cutToNDecimalPlaces } from "~/utils/number";
import names from "../locales/en/game-misc.json";

async function main() {
	const appearance = await db
		.selectFrom("MapPoolMap")
		.select(({ fn }) => [
			"MapPoolMap.stageId",
			"MapPoolMap.mode",
			fn.countAll<number>().as("count"),
		])
		.where("MapPoolMap.calendarEventId", "is not", null)
		.groupBy(["MapPoolMap.stageId", "MapPoolMap.mode"])
		.execute();

	const usage: Record<
		ModeShort,
		{ stageId: StageId; count: number; relativeCount: number }[]
	> = {
		TW: [],
		SZ: [],
		TC: [],
		RM: [],
		CB: [],
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

			const firstAppear = await db
				.selectFrom("MapPoolMap")
				.innerJoin(
					"CalendarEvent",
					"MapPoolMap.calendarEventId",
					"CalendarEvent.id",
				)
				.innerJoin(
					"CalendarEventDate",
					"CalendarEvent.id",
					"CalendarEventDate.eventId",
				)
				.select((eb) =>
					eb.fn.min("CalendarEventDate.startTime").as("firstAppear"),
				)
				.executeTakeFirst();

			const firstAppearDate = firstAppear
				? databaseTimestampToDate(firstAppear.firstAppear)
				: null;

			const datesSinceFirstAppear = firstAppearDate
				? Math.floor((dbAgeDate.getTime() - firstAppearDate.getTime()) / 864e5)
				: null;

			usage[mode].push({
				stageId,
				count,
				relativeCount: datesSinceFirstAppear
					? cutToNDecimalPlaces((count / datesSinceFirstAppear) * 30, 3)
					: 0,
			});
		}

		usage[mode].sort((a, b) => b.relativeCount - a.relativeCount);
	}

	logger.info(`DB Age: ${dbAgeDate.toISOString()}\n`);
	for (const mode of modesShort) {
		logger.info(mode);
		let banCount = 0;
		for (const [i, { stageId, count, relativeCount }] of usage[
			mode
		].entries()) {
			const name = names[`STAGE_${stageId}`];

			const isBanned = BANNED_MAPS[mode].includes(stageId);
			if (isBanned) banCount++;

			logger.info(
				`${i < 9 ? " " : ""}${i + 1}) ${
					isBanned ? "❌" : "  "
				} ${name}: ${relativeCount} (${count})`,
			);
		}

		logger.info(`Banned maps: ${banCount}`);
		logger.info();
	}
}

void main();
