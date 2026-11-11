import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TeamEligibility from "./TeamEligibility.server";

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const eligibleUserId = () => users.id(2);

const createTournament = async (
	args: Partial<Parameters<typeof TournamentFactory.create>[0]> = {},
) => {
	const { id } = await TournamentFactory.create({
		authorId: organizerId(),
		...args,
	});

	return tournamentFromDB(id);
};

describe("TeamEligibility.ineligibleReason", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("returns null for a user with a friend code", async () => {
		const tournament = await createTournament();

		expect(
			await TeamEligibility.ineligibleReason({
				tournament,
				userId: eligibleUserId(),
			}),
		).toBeNull();
	});

	test("returns USER_NOT_FOUND for an unknown user", async () => {
		const tournament = await createTournament();

		expect(
			await TeamEligibility.ineligibleReason({ tournament, userId: 999_999 }),
		).toBe("USER_NOT_FOUND");
	});

	test("returns NO_FRIEND_CODE for a user without a friend code", async () => {
		const tournament = await createTournament();
		const user = await UserFactory.create({ friendCode: null });

		expect(
			await TeamEligibility.ineligibleReason({ tournament, userId: user.id }),
		).toBe("NO_FRIEND_CODE");
	});

	test("requires an in-game name only when the tournament does", async () => {
		const user = await UserFactory.create({ profile: null });

		expect(
			await TeamEligibility.ineligibleReason({
				tournament: await createTournament({ requireInGameNames: true }),
				userId: user.id,
			}),
		).toBe("NO_IN_GAME_NAME");
		expect(
			await TeamEligibility.ineligibleReason({
				tournament: await createTournament(),
				userId: user.id,
			}),
		).toBeNull();
	});

	test("returns SITE_BANNED for a user banned from sendou.ink", async () => {
		const tournament = await createTournament();
		const user = await UserFactory.create(
			{},
			{ ban: { banned: 1, bannedReason: null, bannedByUserId: null } },
		);
		await refreshBannedCache();

		expect(
			await TeamEligibility.ineligibleReason({ tournament, userId: user.id }),
		).toBe("SITE_BANNED");
	});

	test("returns ORG_BANNED for a user banned by the organization, unless skipped", async () => {
		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: organizerId() },
			{ bannedUserIds: [eligibleUserId()] },
		);
		const tournament = await createTournament({
			organizationId: organization.id,
		});

		expect(
			await TeamEligibility.ineligibleReason({
				tournament,
				userId: eligibleUserId(),
			}),
		).toBe("ORG_BANNED");
		expect(
			await TeamEligibility.ineligibleReason({
				tournament,
				userId: eligibleUserId(),
				skip: ["ORG_BANNED"],
			}),
		).toBeNull();
	});
});
