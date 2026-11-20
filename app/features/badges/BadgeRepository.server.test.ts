import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import * as FeedRepository from "~/features/feed/FeedRepository.server";
import * as BadgeRepository from "./BadgeRepository.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";

describe("syncXPBadges", () => {
	let user: { id: number };

	beforeEach(async () => {
		user = await UserFactory.create();
		await BadgeFactory.createMany(SPLATOON_3_XP_BADGE_VALUES.length, (i) => ({
			code: String(SPLATOON_3_XP_BADGE_VALUES[i]),
			displayName: `${SPLATOON_3_XP_BADGE_VALUES[i]}+ XP`,
		}));
	});

	test("assigns badge to user with qualifying peakXp", async () => {
		await givePeakXp(user.id, 3000);

		await BadgeRepository.syncXPBadges();

		const badge = await findBadgeByCode("3000");
		expect(badge?.owners).toHaveLength(1);
		expect(badge?.owners[0].id).toBe(user.id);
	});

	test("assigns highest qualifying badge when peakXp exceeds threshold", async () => {
		await givePeakXp(user.id, 3250);

		await BadgeRepository.syncXPBadges();

		const badge3200 = await findBadgeByCode("3200");
		const badge3300 = await findBadgeByCode("3300");

		expect(badge3200?.owners).toHaveLength(1);
		expect(badge3300?.owners).toHaveLength(0);
	});

	test("does not assign badge when peakXp is below minimum threshold", async () => {
		await givePeakXp(user.id, 2500);

		await BadgeRepository.syncXPBadges();

		const badge2600 = await findBadgeByCode("2600");
		expect(badge2600?.owners).toHaveLength(0);
	});
});

describe("findById", () => {
	const users = UserFactory.pool();
	const winnerId = () => users.id(1);
	const otherId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	test("sums a user's tournament wins and manual grants into one owner, most copies first", async () => {
		const badge = await BadgeFactory.create();
		await TournamentFactory.createPlayed(
			{ authorId: winnerId(), minMembersPerTeam: 1, badges: [badge.id] },
			{ teamRosters: [[winnerId()], [otherId()]], playedOut: "all" },
		);
		await BadgeRepository.replaceOwners({
			badgeId: badge.id,
			ownerIds: [otherId(), winnerId(), winnerId()],
		});

		const found = await BadgeRepository.findById(badge.id);

		expect(found?.owners.map(({ id, count }) => ({ id, count }))).toEqual([
			{ id: winnerId(), count: 2 },
			{ id: otherId(), count: 1 },
		]);
	});

	test("returns null for an unknown id", async () => {
		expect(await BadgeRepository.findById(9999)).toBeNull();
	});
});

describe("findByManagersList", () => {
	const users = UserFactory.pool();
	const managerId = () => users.id(1);
	const otherManagerId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	test("lists a badge managed by several of the users once", async () => {
		const shared = await BadgeFactory.create(null, {
			managerIds: [managerId(), otherManagerId()],
		});
		const own = await BadgeFactory.create(null, { managerIds: [managerId()] });
		await BadgeFactory.create();

		const badges = await BadgeRepository.findByManagersList([
			managerId(),
			otherManagerId(),
		]);

		expect(badges.map((badge) => badge.id)).toEqual([shared.id, own.id]);
	});
});

describe("replaceManagers", () => {
	test("empty list clears existing managers", async () => {
		const user = await UserFactory.create();
		const badge = await BadgeFactory.create(null, { managerIds: [user.id] });

		await BadgeRepository.replaceManagers({
			badgeId: badge.id,
			managerIds: [],
		});

		const updated = await BadgeRepository.findById(badge.id);
		expect(updated?.managers).toHaveLength(0);
	});
});

describe("replaceOwners", () => {
	test("empty list clears existing owners", async () => {
		const user = await UserFactory.create();
		const badge = await BadgeFactory.create(null, { ownerIds: [user.id] });

		await BadgeRepository.replaceOwners({ badgeId: badge.id, ownerIds: [] });

		const updated = await BadgeRepository.findById(badge.id);
		expect(updated?.owners).toHaveLength(0);
	});

	describe("with a badge won at a tournament", () => {
		const users = UserFactory.pool();
		const winnerId = () => users.id(1);
		const loserId = () => users.id(2);
		const addedByManagerId = () => users.id(3);
		let badgeId: number;

		beforeEach(async () => {
			await users.create(3);
			badgeId = (await BadgeFactory.create()).id;
			await TournamentFactory.createPlayed(
				{ authorId: winnerId(), minMembersPerTeam: 1, badges: [badgeId] },
				{ teamRosters: [[winnerId()], [loserId()]], playedOut: "all" },
			);
		});

		test("keeps the win tied to the tournament when another owner is added", async () => {
			await BadgeRepository.replaceOwners({
				badgeId,
				ownerIds: [winnerId(), addedByManagerId()],
			});

			expect(await tournamentWinnerIds()).toEqual([winnerId()]);
			expect(await ownerCounts(badgeId)).toEqual([
				{ id: winnerId(), count: 1 },
				{ id: addedByManagerId(), count: 1 },
			]);
		});

		test("grants extra copies to a winner on top of their tournament win", async () => {
			await BadgeRepository.replaceOwners({
				badgeId,
				ownerIds: [winnerId(), winnerId(), winnerId()],
			});

			expect(await tournamentWinnerIds()).toEqual([winnerId()]);
			expect(await ownerCounts(badgeId)).toEqual([
				{ id: winnerId(), count: 3 },
			]);
		});

		test("removes the win when the winner is removed from the owners", async () => {
			await BadgeRepository.replaceOwners({
				badgeId,
				ownerIds: [addedByManagerId()],
			});

			expect(await tournamentWinnerIds()).toEqual([]);
			expect(await ownerCounts(badgeId)).toEqual([
				{ id: addedByManagerId(), count: 1 },
			]);
		});
	});
});

async function tournamentWinnerIds() {
	const owners =
		await FeedRepository.findAllTournamentBadgeOwnersStartedAfter(0);
	return owners.map((owner) => owner.userId);
}

async function ownerCounts(badgeId: number) {
	const badge = await BadgeRepository.findById(badgeId);
	return R.sortBy(
		badge!.owners.map(({ id, count }) => ({ id, count })),
		(owner) => owner.id,
	);
}

/** Gives the user a linked X Rank player whose one placement is worth `power`. */
const givePeakXp = (userId: number, power: number) =>
	XRankPlacementFactory.create(
		{ playerUserId: userId, power },
		{ refreshPeakXp: true },
	);

async function findBadgeByCode(code: string) {
	const badges = await BadgeRepository.findAll();
	const badge = badges.find((b) => b.code === code);
	if (!badge) return null;
	return BadgeRepository.findById(badge.id);
}
