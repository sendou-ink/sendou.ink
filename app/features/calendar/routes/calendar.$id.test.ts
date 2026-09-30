import { addDays, subDays } from "date-fns";
import type * as v from "valibot";
import { describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import { action } from "./calendar.$id";

const deleteAction = wrappedAction<v.GenericSchema<Record<string, never>>>({
	action,
});

describe("calendar event deletion", () => {
	test("doesn't let a user delete someone else's tournament", async () => {
		const admin = await UserFactory.createAdmin();
		await UserFactory.createRegular();
		const tournament = await TournamentFactory.create({
			authorId: admin.id,
		});

		await expect(
			deleteAction(
				{},
				{ user: "regular", params: { id: String(tournament.eventId) } },
			),
		).rejects.toThrow("Response thrown with status code: 403");

		const eventAfter = await CalendarRepository.findById(tournament.eventId);
		expect(eventAfter, "the tournament was deleted").toBeTruthy();
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

	test("lets the author delete a tournament whose start time passed without it ever starting", async () => {
		await UserFactory.createAdmin();
		const regular = await UserFactory.createRegular();
		const tournament = await TournamentFactory.create({
			authorId: regular.id,
			startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 2))],
		});

		await deleteAction(
			{},
			{ user: "regular", params: { id: String(tournament.eventId) } },
		);

		const eventAfter = await CalendarRepository.findById(tournament.eventId);
		expect(eventAfter).toBeNull();
	});

	test("lets an admin of an established organization delete its tournament", async () => {
		const admin = await UserFactory.createAdmin();
		await UserFactory.createRegular();
		const orgAdmin = await UserFactory.create();
		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: orgAdmin.id },
			{ isEstablished: true },
		);
		const tournament = await TournamentFactory.create({
			authorId: admin.id,
			organizationId: organization.id,
		});

		await deleteAction(
			{},
			{ user: orgAdmin.id, params: { id: String(tournament.eventId) } },
		);

		const eventAfter = await CalendarRepository.findById(tournament.eventId);
		expect(eventAfter).toBeNull();
	});
});
