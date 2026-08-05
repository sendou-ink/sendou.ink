import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
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
		// Jan 31, 6 PM in America/Los_Angeles — the org page calendar renders
		// this into the January grid for viewers west of UTC
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
