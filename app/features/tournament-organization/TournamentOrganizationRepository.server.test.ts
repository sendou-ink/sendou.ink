import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "~/db/seed/factories/CalendarEventResultFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";
import { seedOrgEventWithParticipants } from "./test-utils";

const users = UserFactory.pool();

describe("findByUserId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("returns organizations where user is a member", async () => {
		const [org1, org2] = await TournamentOrganizationFactory.createMany(2, {
			ownerId: users.id(1),
		});

		const result = await TournamentOrganizationRepository.findByUserId(
			users.id(1),
		);

		expect(result).toHaveLength(2);
		expect(result.map((org) => org.id).sort()).toEqual(
			[org1.id, org2.id].sort(),
		);
	});

	test("filters organizations by role when roles parameter is provided", async () => {
		const org1 = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});
		await TournamentOrganizationFactory.create(
			{ ownerId: users.id(2) },
			{ members: [{ userId: users.id(1), role: "ORGANIZER" }] },
		);

		const adminOrgs = await TournamentOrganizationRepository.findByUserId(
			users.id(1),
			{ roles: ["ADMIN"] },
		);
		const allOrgs = await TournamentOrganizationRepository.findByUserId(
			users.id(1),
		);

		expect(adminOrgs).toHaveLength(1);
		expect(adminOrgs[0].id).toBe(org1.id);
		expect(allOrgs).toHaveLength(2);
	});

	test("returns empty array when user is not a member of any organization", async () => {
		await TournamentOrganizationFactory.create({ ownerId: users.id(1) });

		const result = await TournamentOrganizationRepository.findByUserId(
			users.id(2),
		);

		expect(result).toHaveLength(0);
	});
});

describe("findEventsByMonth", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	const seedOrgEventAt = async (startTime: Date) => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});
		await CalendarEventFactory.create({
			authorId: users.id(1),
			organizationId: org.id,
			startTimes: [dateToDatabaseTimestamp(startTime)],
		});

		return org;
	};

	test("includes an event starting within the timezone margin before the month", async () => {
		const org = await seedOrgEventAt(new Date("2024-12-31T22:00:00Z"));

		const events = await TournamentOrganizationRepository.findEventsByMonth({
			month: 0,
			year: 2025,
			organizationId: org.id,
		});

		expect(events).toHaveLength(1);
	});

	test("includes an event starting within the timezone margin after the month", async () => {
		// Jan 31, 6 PM in America/Los_Angeles: rendered into the January grid for viewers west of UTC
		const org = await seedOrgEventAt(new Date("2025-02-01T02:00:00Z"));

		const events = await TournamentOrganizationRepository.findEventsByMonth({
			month: 0,
			year: 2025,
			organizationId: org.id,
		});

		expect(events).toHaveLength(1);
	});
});

describe("countActiveParticipants", () => {
	const WINDOW_START = 1_700_000_000;
	const WINDOW_END = WINDOW_START + 60 * 60 * 24 * 31;
	const IN_WINDOW = WINDOW_START + 60 * 60 * 24;

	const countForOrg = (organizationId: number) =>
		TournamentOrganizationRepository.countActiveParticipants({
			organizationId,
			startTime: WINDOW_START,
			endTime: WINDOW_END,
		});

	beforeEach(async () => {
		await users.create(5);
	});

	test("counts distinct participants across the organization's events in the window", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [users.id(1), users.id(2)],
		});
		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [users.id(2), users.id(3)],
		});

		// users 1, 2, 3 — user 2 played in both events but is counted once
		expect(await countForOrg(org.id)).toBe(3);
	});

	test("excludes teams that did not check in", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [users.id(1), users.id(2)],
			checkIn: "none",
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes teams that checked out", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [users.id(1), users.id(2)],
			checkIn: "out",
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes events outside the time window", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: WINDOW_END + 60 * 60 * 24,
			participantUserIds: [users.id(1), users.id(2)],
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes other organizations' events", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});
		const otherOrg = await TournamentOrganizationFactory.create({
			ownerId: users.id(2),
		});

		await seedOrgEventWithParticipants({
			organizationId: otherOrg.id,
			startTime: IN_WINDOW,
			participantUserIds: [users.id(1), users.id(2), users.id(3)],
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("returns 0 when the organization has no events", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		expect(await countForOrg(org.id)).toBe(0);
	});
});

describe("findAllSeriesWinsByUserId", () => {
	const FIRST_EVENT_STARTED_AT = 1_700_000_000;
	const DAY_IN_SECONDS = 60 * 60 * 24;

	const winnerId = () => users.id(1);
	const loserId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const seedPlayedEvent = async ({
		organizationId,
		name,
		startTime,
		winnerUserId = winnerId(),
	}: {
		organizationId: number;
		name: string;
		startTime: number;
		winnerUserId?: number;
	}) => {
		const loserUserId = winnerUserId === winnerId() ? loserId() : winnerId();

		const { id } = await TournamentFactory.createPlayed(
			{
				authorId: winnerUserId,
				organizationId,
				name,
				startTimes: [startTime],
				minMembersPerTeam: 1,
			},
			{ teamRosters: [[winnerUserId], [loserUserId]], playedOut: "all" },
		);

		return id;
	};

	const winsInSeries = ({
		organizationId,
		excludeTournamentId = 0,
	}: {
		organizationId: number;
		excludeTournamentId?: number;
	}) =>
		TournamentOrganizationRepository.findAllSeriesWinsByUserId({
			organizationId,
			substringMatches: ["Low Ink"],
			userId: winnerId(),
			excludeTournamentId,
		});

	test("returns the events of the series won by the user, oldest first", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedPlayedEvent({
			organizationId: org.id,
			name: "Low Ink February",
			startTime: FIRST_EVENT_STARTED_AT + DAY_IN_SECONDS,
		});
		await seedPlayedEvent({
			organizationId: org.id,
			name: "Low Ink January",
			startTime: FIRST_EVENT_STARTED_AT,
		});

		const wins = await winsInSeries({ organizationId: org.id });

		expect(wins.map((win) => win.name)).toEqual([
			"Low Ink January",
			"Low Ink February",
		]);
		expect(wins[0].startTime).toEqual(
			databaseTimestampToDate(FIRST_EVENT_STARTED_AT),
		);
	});

	const seedReportedEvent = async ({
		organizationId,
		name,
		startTime,
		winnerUserId = winnerId(),
	}: {
		organizationId: number;
		name: string;
		startTime: number;
		winnerUserId?: number;
	}) => {
		const event = await CalendarEventFactory.create({
			authorId: winnerUserId,
			organizationId,
			name,
			startTimes: [startTime],
		});

		await CalendarEventResultFactory.create({
			eventId: event.id,
			participantCount: 2,
			results: [
				{
					teamName: "Winners",
					placement: 1,
					players: [{ userId: winnerUserId, name: null }],
				},
			],
		});
	};

	test("includes events whose results were reported by hand", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedReportedEvent({
			organizationId: org.id,
			name: "Low Ink January",
			startTime: FIRST_EVENT_STARTED_AT,
		});
		await seedReportedEvent({
			organizationId: org.id,
			name: "Low Ink February",
			startTime: FIRST_EVENT_STARTED_AT + DAY_IN_SECONDS,
			winnerUserId: loserId(),
		});

		const wins = await winsInSeries({ organizationId: org.id });

		expect(wins.map((win) => win.name)).toEqual(["Low Ink January"]);
	});

	test("excludes events of the organization outside the series", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedPlayedEvent({
			organizationId: org.id,
			name: "Paddling Pool",
			startTime: FIRST_EVENT_STARTED_AT,
		});

		expect(await winsInSeries({ organizationId: org.id })).toHaveLength(0);
	});

	test("excludes events of another organization", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});
		const otherOrg = await TournamentOrganizationFactory.create({
			ownerId: users.id(2),
		});

		await seedPlayedEvent({
			organizationId: otherOrg.id,
			name: "Low Ink January",
			startTime: FIRST_EVENT_STARTED_AT,
		});

		expect(await winsInSeries({ organizationId: org.id })).toHaveLength(0);
	});

	test("excludes events the user did not win", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		await seedPlayedEvent({
			organizationId: org.id,
			name: "Low Ink January",
			startTime: FIRST_EVENT_STARTED_AT,
			winnerUserId: loserId(),
		});

		expect(await winsInSeries({ organizationId: org.id })).toHaveLength(0);
	});

	test("excludes the tournament the wins are looked up for", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		const tournamentId = await seedPlayedEvent({
			organizationId: org.id,
			name: "Low Ink January",
			startTime: FIRST_EVENT_STARTED_AT,
		});

		expect(
			await winsInSeries({
				organizationId: org.id,
				excludeTournamentId: tournamentId,
			}),
		).toHaveLength(0);
	});
});
