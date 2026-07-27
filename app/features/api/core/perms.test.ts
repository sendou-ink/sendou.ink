import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dbReset } from "~/utils/Test";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "./perms";

describe("Permission logic consistency between findAllApiTokens and checkUserHasApiAccess", () => {
	const users = UserFactory.pool();

	beforeEach(async () => {
		await users.create(4);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("both functions grant access for isApiAccesser flag", async () => {
		await AdminRepository.makeApiAccesserByUserId(users.id(1));

		await ApiRepository.generateToken(users.id(1), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(1));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions grant access for isTournamentOrganizer flag", async () => {
		await AdminRepository.makeTournamentOrganizerByUserId(users.id(1));

		await ApiRepository.generateToken(users.id(1), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(1));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions grant access for patronTier >= 2", async () => {
		await AdminRepository.forcePatron({
			id: users.id(1),
			patronTier: 2,
			patronStartedAt: new Date(),
			patronExpiresAt: add(new Date(), { months: 3 }),
		});

		await ApiRepository.generateToken(users.id(1), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(1));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions deny access for patronTier < 2", async () => {
		await AdminRepository.forcePatron({
			id: users.id(1),
			patronTier: 1,
			patronStartedAt: new Date(),
			patronExpiresAt: add(new Date(), { months: 3 }),
		});

		await ApiRepository.generateToken(users.id(1), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(1));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions grant access for ADMIN/ORGANIZER/STREAMER of established org", async () => {
		const org = await TournamentOrganizationRepository.insert({
			ownerId: users.id(1),
			name: "Test Org",
		});

		await TournamentOrganizationRepository.updateIsEstablished(org.id, true);

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);

		for (const role of ["ADMIN", "ORGANIZER", "STREAMER"] as const) {
			const userId =
				role === "ADMIN"
					? users.id(2)
					: role === "ORGANIZER"
						? users.id(3)
						: users.id(4);

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
		const org = await TournamentOrganizationRepository.insert({
			ownerId: users.id(1),
			name: "Test Org",
		});

		await TournamentOrganizationRepository.updateIsEstablished(org.id, true);

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);
		await TournamentOrganizationRepository.update({
			id: org.id,
			name: orgData!.name,
			description: orgData!.description,
			socials: orgData!.socials,
			members: [{ userId: users.id(2), role: "MEMBER", roleDisplayName: null }],
			series: [],
			badges: [],
		});

		await ApiRepository.generateToken(users.id(2), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(2));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions deny access for ADMIN of non-established org", async () => {
		const org = await TournamentOrganizationRepository.insert({
			ownerId: users.id(1),
			name: "Test Org",
		});

		const orgData = await TournamentOrganizationRepository.findBySlug(org.slug);
		await TournamentOrganizationRepository.update({
			id: org.id,
			name: orgData!.name,
			description: orgData!.description,
			socials: orgData!.socials,
			members: [{ userId: users.id(2), role: "ADMIN", roleDisplayName: null }],
			series: [],
			badges: [],
		});

		await ApiRepository.generateToken(users.id(2), "read");
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(users.id(2));
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});
});
