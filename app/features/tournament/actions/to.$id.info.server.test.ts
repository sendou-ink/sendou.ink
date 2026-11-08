import { addDays, subDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as SavedCalendarEventFactory from "~/db/seed/factories/SavedCalendarEventFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import * as SavedCalendarEventRepository from "../SavedCalendarEventRepository.server";
import { TOURNAMENT } from "../tournament-constants";
import type { saveTournamentSchema } from "../tournament-schemas";
import { action as infoAction } from "./to.$id.info.server";

const info = wrappedAction<typeof saveTournamentSchema>({ action: infoAction });

const users = UserFactory.pool();
const saverId = () => users.id(1);

describe("SAVE_TOURNAMENT", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("tournaments saved in the past don't count towards the saved limit", async () => {
		for (let i = 0; i < TOURNAMENT.MAX_SAVED_COUNT; i++) {
			await saveTournamentStartingAt(subDays(new Date(), 30 + i));
		}
		const upcoming = await createTournamentStartingAt(addDays(new Date(), 7));

		const response = await save(upcoming.id);

		expect(errorToastOf(response)).toBeNull();
		expect(await isSaved(upcoming.id)).toBe(true);
	});

	test("rejects saving once the limit of upcoming saved tournaments is reached", async () => {
		for (let i = 0; i < TOURNAMENT.MAX_SAVED_COUNT; i++) {
			await saveTournamentStartingAt(addDays(new Date(), 1 + i));
		}
		const upcoming = await createTournamentStartingAt(addDays(new Date(), 30));

		const response = await save(upcoming.id);

		expect(errorToastOf(response)).toBe("Maximum saved tournaments reached");
		expect(await isSaved(upcoming.id)).toBe(false);
	});
});

function createTournamentStartingAt(startTime: Date) {
	return TournamentFactory.create({
		authorId: saverId(),
		startTimes: [dateToDatabaseTimestamp(startTime)],
	});
}

async function saveTournamentStartingAt(startTime: Date) {
	const tournament = await createTournamentStartingAt(startTime);
	await SavedCalendarEventFactory.create({
		userId: saverId(),
		tournamentId: tournament.id,
	});
}

function save(tournamentId: number) {
	return info(
		{ _action: "SAVE_TOURNAMENT" },
		{ user: saverId(), params: { id: String(tournamentId) } },
	);
}

function isSaved(tournamentId: number) {
	return SavedCalendarEventRepository.isSaved({
		userId: saverId(),
		tournamentId,
	});
}

function errorToastOf(response: Response | null | undefined) {
	if (!response) return null;

	return new URLSearchParams(
		response.headers.get("location")?.split("?")[1],
	).get("__error");
}
