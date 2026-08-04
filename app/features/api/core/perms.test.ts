import { describe, expect, test } from "vitest";
import * as ApiTokenFactory from "~/db/seed/factories/ApiTokenFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "./perms";

describe("Permission logic consistency between findAllApiTokens and checkUserHasApiAccess", () => {
	test("both functions grant access for isApiAccesser flag", async () => {
		const { id } = await UserFactory.create(null, { roles: ["API_ACCESSER"] });

		await ApiTokenFactory.create({ userId: id });
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

		await ApiTokenFactory.create({ userId: id });
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions grant access for patronTier >= 2", async () => {
		const { id } = await UserFactory.create(null, { patronTier: 2 });

		await ApiTokenFactory.create({ userId: id });
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(1);
		expect(hasAccess).toBe(true);
	});

	test("both functions deny access for patronTier < 2", async () => {
		const { id } = await UserFactory.create(null, { patronTier: 1 });

		await ApiTokenFactory.create({ userId: id });
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions grant access for ADMIN/ORGANIZER/STREAMER of established org", async () => {
		const [owner, admin, organizer, streamer] = await UserFactory.createMany(4);

		await TournamentOrganizationFactory.create(
			{ ownerId: owner.id },
			{
				isEstablished: true,
				members: [
					{ userId: admin.id, role: "ADMIN" },
					{ userId: organizer.id, role: "ORGANIZER" },
					{ userId: streamer.id, role: "STREAMER" },
				],
			},
		);

		for (const userId of [admin.id, organizer.id, streamer.id]) {
			await ApiTokenFactory.create({ userId });
			const tokens = await ApiRepository.findAllApiTokens();

			const user = await UserRepository.findLeanById(userId);
			const hasAccess = await checkUserHasApiAccess(user!);

			expect(tokens.length).toBeGreaterThan(0);
			expect(hasAccess).toBe(true);
		}
	});

	test("both functions deny access for MEMBER of established org", async () => {
		const [owner, member] = await UserFactory.createMany(2);

		await TournamentOrganizationFactory.create(
			{ ownerId: owner.id },
			{ isEstablished: true, members: [{ userId: member.id, role: "MEMBER" }] },
		);

		await ApiTokenFactory.create({ userId: member.id });
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(member.id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});

	test("both functions deny access for ADMIN of non-established org", async () => {
		const [owner, member] = await UserFactory.createMany(2);

		await TournamentOrganizationFactory.create(
			{ ownerId: owner.id },
			{ members: [{ userId: member.id, role: "ADMIN" }] },
		);

		await ApiTokenFactory.create({ userId: member.id });
		const tokens = await ApiRepository.findAllApiTokens();

		const user = await UserRepository.findLeanById(member.id);
		const hasAccess = await checkUserHasApiAccess(user!);

		expect(tokens).toHaveLength(0);
		expect(hasAccess).toBe(false);
	});
});
