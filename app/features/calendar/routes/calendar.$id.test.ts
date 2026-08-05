import { addDays } from "date-fns";
import { describe, expect, test } from "vitest";
import type { z } from "zod";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action } from "./calendar.$id";

const deleteAction = wrappedAction<z.ZodType<Record<string, never>>>({
	action,
});

describe("calendar event deletion", () => {
	test("doesn't let a user delete someone else's tournament", async () => {
		const admin = await UserFactory.createAdmin();
		await UserFactory.createRegular();
		const tournament = await TournamentFactory.create({
			authorId: admin.id,
		});

		const response = await deleteAction(
			{},
			{ user: "regular", params: { id: String(tournament.eventId) } },
		);

		const eventAfter = await CalendarRepository.findById(tournament.eventId);
		expect(eventAfter, "the tournament was deleted").toBeTruthy();
		assertResponseErrored(response);
	});

	test("lets the author delete their own not-yet-started tournament", async () => {
		await UserFactory.createAdmin();
		const regular = await UserFactory.createRegular();
		const tournament = await TournamentFactory.create({
			authorId: regular.id,
			startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 7))],
		});

		await deleteAction(
			{},
			{ user: "regular", params: { id: String(tournament.eventId) } },
		);

		const eventAfter = await CalendarRepository.findById(tournament.eventId);
		expect(eventAfter).toBeNull();
	});
});
