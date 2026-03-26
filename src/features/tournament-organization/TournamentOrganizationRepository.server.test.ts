import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

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
