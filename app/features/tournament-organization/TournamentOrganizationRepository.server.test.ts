import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";
import { seedOrgEventWithParticipants } from "./test-utils";

const createOrganization = async ({
	ownerId,
	name,
}: {
	ownerId: number;
	name: string;
}) => {
	return TournamentOrganizationRepository.create({
		ownerId,
		name,
	});
};

describe("findByUserId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns organizations where user is a member", async () => {
		const org1 = await createOrganization({
			ownerId: 1,
			name: "Test Organization 1",
		});
		const org2 = await createOrganization({
			ownerId: 1,
			name: "Test Organization 2",
		});

		const result = await TournamentOrganizationRepository.findByUserId(1);

		expect(result).toHaveLength(2);
		expect(result.map((org) => org.id).sort()).toEqual(
			[org1.id, org2.id].sort(),
		);
	});

	test("filters organizations by role when roles parameter is provided", async () => {
		const org1 = await createOrganization({
			ownerId: 1,
			name: "Test Organization 1",
		});
		const org2 = await createOrganization({
			ownerId: 2,
			name: "Test Organization 2",
		});

		const org2Data = await TournamentOrganizationRepository.findBySlug(
			org2.slug,
		);

		await TournamentOrganizationRepository.update({
			id: org2.id,
			name: org2Data!.name,
			description: org2Data!.description,
			socials: org2Data!.socials,
			members: [
				{ userId: 2, role: "ADMIN", roleDisplayName: null },
				{ userId: 1, role: "ORGANIZER", roleDisplayName: null },
			],
			series: [],
			badges: [],
		});

		const adminOrgs = await TournamentOrganizationRepository.findByUserId(1, {
			roles: ["ADMIN"],
		});
		const allOrgs = await TournamentOrganizationRepository.findByUserId(1);

		expect(adminOrgs).toHaveLength(1);
		expect(adminOrgs[0].id).toBe(org1.id);
		expect(allOrgs).toHaveLength(2);
	});

	test("returns empty array when user is not a member of any organization", async () => {
		await createOrganization({
			ownerId: 1,
			name: "Test Organization",
		});

		const result = await TournamentOrganizationRepository.findByUserId(2);

		expect(result).toHaveLength(0);
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
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("counts distinct participants across the organization's events in the window", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [1, 2],
		});
		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [2, 3],
		});

		// users 1, 2, 3 — user 2 played in both events but is counted once
		expect(await countForOrg(org.id)).toBe(3);
	});

	test("excludes teams that did not check in", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [1, 2],
			checkIn: "none",
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes teams that checked out", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: IN_WINDOW,
			participantUserIds: [1, 2],
			checkIn: "out",
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes events outside the time window", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });

		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: WINDOW_END + 60 * 60 * 24,
			participantUserIds: [1, 2],
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("excludes other organizations' events", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });
		const otherOrg = await createOrganization({ ownerId: 2, name: "Other" });

		await seedOrgEventWithParticipants({
			organizationId: otherOrg.id,
			startTime: IN_WINDOW,
			participantUserIds: [1, 2, 3],
		});

		expect(await countForOrg(org.id)).toBe(0);
	});

	test("returns 0 when the organization has no events", async () => {
		const org = await createOrganization({ ownerId: 1, name: "Org" });

		expect(await countForOrg(org.id)).toBe(0);
	});
});
