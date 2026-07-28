import { afterEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dbReset } from "~/utils/Test";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "./perms";

describe("Permission logic consistency between findAllApiTokens and checkUserHasApiAccess", () => {
	afterEach(async () => {
		await dbReset();
	});

	test("both functions grant access for isApiAccesser flag", async () => {
		const { id } = await UserFactory.create(null, { roles: ["API_ACCESSER"] });

		await ApiRepository.generateToken(id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions grant access for isTournamentOrganizer flag", async () => {
		const { id } = await UserFactory.create(
			{},
			{ roles: ["TOURNAMENT_ORGANIZER"] },
		);

		await ApiRepository.generateToken(id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions grant access for patronTier >= 2", async () => {
		const { id } = await UserFactory.create(null, { patronTier: 2 });

		await ApiRepository.generateToken(id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions deny access for patronTier < 2", async () => {
		const { id } = await UserFactory.create(null, { patronTier: 1 });

		await ApiRepository.generateToken(id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions grant access for ADMIN/ORGANIZER/STREAMER of established org", async () => {
		const [owner, admin, organizer, streamer] = await UserFactory.createMany(4);

		const org = await TournamentOrganizationRepository.insert({
			ownerId: owner.id,
			name: "Test Org",
		});

		await TournamentOrganizationRepository.updateIsEstablished(org.id, true);

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);

		const membersByRole = [
			{ role: "ADMIN", userId: admin.id },
			{ role: "ORGANIZER", userId: organizer.id },
			{ role: "STREAMER", userId: streamer.id },
		] as const;

		for (const { role, userId } of membersByRole) {
			await TournamentOrganizationRepository.update({
				id: org.id,
				name: orgData!.name,
				description: orgData!.description,
				socials: orgData!.socials,
				members: [{ userId, role, roleDisplayName: null }],
				series: [],
				badges: [],
			});

			await ApiRepository.generateToken(userId, "read");
			const tokens = await ApiRepository.findAllApiTokens();

			const user = await UserRepository.findLeanById(userId);
			const hasAccess = await checkUserHasApiAccess(user!);

			expect(tokens.length).toBeGreaterThan(0);
			expect(hasAccess).toBe(true);
		}
	});

	test("both functions deny access for MEMBER of established org", async () => {
		const [owner, member] = await UserFactory.createMany(2);

		const org = await TournamentOrganizationRepository.insert({
			ownerId: owner.id,
			name: "Test Org",
		});

		await TournamentOrganizationRepository.updateIsEstablished(org.id, true);

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);
		await TournamentOrganizationRepository.update({
			id: org.id,
			name: orgData!.name,
			description: orgData!.description,
			socials: orgData!.socials,
			members: [{ userId: member.id, role: "MEMBER", roleDisplayName: null }],
			series: [],
			badges: [],
		});

		await ApiRepository.generateToken(member.id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(member.id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions deny access for ADMIN of non-established org", async () => {
		const [owner, member] = await UserFactory.createMany(2);

		const org = await TournamentOrganizationRepository.insert({
			ownerId: owner.id,
			name: "Test Org",
		});

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);
		await TournamentOrganizationRepository.update({
			id: org.id,
			name: orgData!.name,
			description: orgData!.description,
			socials: orgData!.socials,
			members: [{ userId: member.id, role: "ADMIN", roleDisplayName: null }],
			series: [],
			badges: [],
		});

		await ApiRepository.generateToken(member.id, "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(member.id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});
});
