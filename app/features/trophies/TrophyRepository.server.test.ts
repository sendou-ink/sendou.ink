import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { ConcurrentModificationError } from "~/utils/errors";
import * as XpTrophy from "./core/XpTrophy";
import * as TrophyRepository from "./TrophyRepository.server";
import { TROPHY_APPROVALS_REQUIRED } from "./trophies-constants";

describe("trophy approvals", () => {
	let submissionId: number;
	let reviewerIds: number[];

	beforeEach(async () => {
		const submitter = await UserFactory.create();
		reviewerIds = (
			await UserFactory.createMany(TROPHY_APPROVALS_REQUIRED + 1)
		).map((user) => user.id);
		const organization = await TournamentOrganizationFactory.create({
			ownerId: submitter.id,
		});

		const pending = await TrophyFactory.createSubmission({
			organizationId: organization.id,
			submitterUserId: submitter.id,
		});
		submissionId = pending.id;
	});

	test("creates the trophy exactly once when approvals exceed the required count", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED - 1)) {
			expect(await TrophyRepository.addApproval({ submissionId, userId })).toBe(
				null,
			);
		}

		const accepted = await TrophyRepository.addApproval({
			submissionId,
			userId: reviewerIds[TROPHY_APPROVALS_REQUIRED - 1],
		});
		expect(accepted?.id).toBeTypeOf("number");

		expect(
			await TrophyRepository.addApproval({
				submissionId,
				userId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("the named creator becomes the trophy's creator", async () => {
		const artist = await UserFactory.create();
		const submitter = await UserFactory.create();
		const organization = await TournamentOrganizationFactory.create({
			ownerId: submitter.id,
		});
		const pending = await TrophyFactory.createSubmission({
			organizationId: organization.id,
			submitterUserId: submitter.id,
			creatorId: artist.id,
		});

		let accepted: null | {
			id: number;
		} = null;
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			accepted = await TrophyRepository.addApproval({
				submissionId: pending.id,
				userId,
			});
		}

		const trophy = await db
			.selectFrom("Trophy")
			.select(["creatorId", "managerId"])
			.where("id", "=", accepted!.id)
			.executeTakeFirstOrThrow();
		expect(trophy).toEqual({ creatorId: artist.id, managerId: submitter.id });
	});

	test("ignores repeated approvals from the same user", async () => {
		await TrophyRepository.addApproval({
			submissionId,
			userId: reviewerIds[0],
		});

		expect(
			await TrophyRepository.addApproval({
				submissionId,
				userId: reviewerIds[0],
			}),
		).toBe(null);

		const pending = await findSubmissionWithApprovals(submissionId);
		expect(pending?.approvals.length).toBe(1);
		expect(await trophyCount()).toBe(0);
	});

	test("re-approval after acceptance does not create another trophy", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ submissionId, userId });
		}

		expect(
			await TrophyRepository.addApproval({
				submissionId,
				userId: reviewerIds[0],
			}),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("declines a pending trophy that is not accepted", async () => {
		await TrophyRepository.addApproval({
			submissionId,
			userId: reviewerIds[0],
		});

		expect(
			await TrophyRepository.declineSubmission({
				id: submissionId,
				reason: "reason",
				declinedByUserId: reviewerIds[1],
			}),
		).toBe(true);

		const pending = await findSubmissionWithApprovals(submissionId);
		expect(pending?.declinedAt).not.toBe(null);
		expect(pending?.approvals.length).toBe(0);
	});

	test("does not decline an already accepted pending trophy", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ submissionId, userId });
		}

		expect(
			await TrophyRepository.declineSubmission({
				id: submissionId,
				reason: "reason",
				declinedByUserId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(false);

		const pending = await findSubmissionWithApprovals(submissionId);
		expect(pending?.declinedAt).toBe(null);
		expect(await trophyCount()).toBe(1);
	});

	test("stays accepted even if approvals drop below the required count", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ submissionId, userId });
		}

		// biome-ignore lint/plugin: simulates raising TROPHY_APPROVALS_REQUIRED after acceptance, which no production code path can do
		await db
			.deleteFrom("TrophySubmissionApproval")
			.where("submissionId", "=", submissionId)
			.where("userId", "=", reviewerIds[0])
			.execute();

		expect(
			await TrophyRepository.addApproval({
				submissionId,
				userId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(null);

		expect(
			await TrophyRepository.declineSubmission({
				id: submissionId,
				reason: "reason",
				declinedByUserId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(false);

		expect(await trophyCount()).toBe(1);
	});

	test("approvals after a decline do not create a trophy", async () => {
		await TrophyRepository.declineSubmission({
			id: submissionId,
			reason: "reason",
			declinedByUserId: reviewerIds[0],
		});

		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			expect(await TrophyRepository.addApproval({ submissionId, userId })).toBe(
				null,
			);
		}

		expect(await trophyCount()).toBe(0);
	});
});

describe("trophy list tiers", () => {
	let authorId: number;
	let trophyId: number;

	beforeEach(async () => {
		const author = await UserFactory.create();
		authorId = author.id;

		const trophy = await TrophyFactory.create({ name: "Tiered Trophy" });
		trophyId = trophy.id;
	});

	test("an upcoming tournament without tier info does not hide the earned tier", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({ tier: 3 });
	});

	test("uses the most recent tier when multiple tournaments have one", async () => {
		await createTrophyTournament({ trophyId, tier: 5, startInDays: -30 });
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -7 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({ tier: 3 });
	});

	test("has no tier when no linked tournament has tier info", async () => {
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({
			tier: null,
			tentativeTier: null,
		});
	});

	test("returns the start time of the next upcoming tournament", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 20 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		const trophy = await findTrophyByName("Tiered Trophy");

		const expected = dateToDatabaseTimestamp(daysFromNow(10));
		expect(
			Math.abs((trophy?.upcomingTournamentAt ?? 0) - expected),
		).toBeLessThan(10);
	});

	test("sorts trophies with an upcoming tournament first within the same tier", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });

		const upcoming = await TrophyFactory.create({ name: "Upcoming Trophy" });
		await createTrophyTournament({
			trophyId: upcoming.id,
			tier: 3,
			startInDays: -14,
		});
		await createTrophyTournament({
			trophyId: upcoming.id,
			tier: null,
			startInDays: 10,
		});

		const distant = await TrophyFactory.create({ name: "Distant Trophy" });
		await createTrophyTournament({
			trophyId: distant.id,
			tier: 3,
			startInDays: -7,
		});
		await createTrophyTournament({
			trophyId: distant.id,
			tier: null,
			startInDays: 5 * 7,
		});

		const names = (await TrophyRepository.findAllRankedByTier()).map(
			(row) => row.name,
		);

		expect(names).toEqual([
			"Upcoming Trophy",
			"Tiered Trophy",
			"Distant Trophy",
		]);
	});

	function createTrophyTournament({
		trophyId: forTrophyId,
		tier,
		startInDays,
	}: {
		trophyId: number;
		tier: TournamentTierNumber | null;
		startInDays: number;
	}) {
		return TournamentFactory.create(
			{
				authorId,
				startTimes: [dateToDatabaseTimestamp(daysFromNow(startInDays))],
				trophyId: forTrophyId,
			},
			tier ? { tier } : undefined,
		);
	}
});

describe("existsByName", () => {
	let ownerId: number;
	let approverIds: number[];
	let organizationId: number;

	beforeEach(async () => {
		const owner = await UserFactory.create();
		ownerId = owner.id;
		approverIds = (await UserFactory.createMany(TROPHY_APPROVALS_REQUIRED)).map(
			(user) => user.id,
		);
		organizationId = (await TournamentOrganizationFactory.create({ ownerId }))
			.id;
	});

	test("updating a trophy keeping its name does not collide with its accepted submission", async () => {
		await TrophyFactory.createSubmission(
			{ name: "Winner's Cup", organizationId, submitterUserId: ownerId },
			{ approverUserIds: approverIds },
		);

		const trophy = await db
			.selectFrom("Trophy")
			.select("id")
			.where("name", "=", "Winner's Cup")
			.executeTakeFirstOrThrow();

		expect(
			await TrophyRepository.existsByName({
				name: "Winner's Cup",
				excludeTrophyId: trophy.id,
			}),
		).toBe(false);
	});

	test("an existing trophy's name still blocks new submissions", async () => {
		await TrophyFactory.create({ name: "Winner's Cup" });

		expect(await TrophyRepository.existsByName({ name: "Winner's Cup" })).toBe(
			true,
		);
	});

	test("a submission awaiting review blocks the name", async () => {
		await TrophyFactory.createSubmission({
			name: "Contested Cup",
			organizationId,
			submitterUserId: ownerId,
		});

		expect(await TrophyRepository.existsByName({ name: "Contested Cup" })).toBe(
			true,
		);
	});

	test("a declined submission does not block the name", async () => {
		await TrophyFactory.createSubmission(
			{ name: "Declined Cup", organizationId, submitterUserId: ownerId },
			{ declinedBy: { userId: approverIds[0], reason: "reason" } },
		);

		expect(await TrophyRepository.existsByName({ name: "Declined Cup" })).toBe(
			false,
		);
	});
});

describe("user deletion", () => {
	test("keeps their trophies and drops their approvals", async () => {
		const submitter = await UserFactory.create();
		// bare: a random profile's weapon pool would block the delete on its own
		const deleted = await UserFactory.create({ profile: null });

		const trophy = await TrophyFactory.create({
			name: "Orphaned Trophy",
			creatorId: deleted.id,
			managerId: deleted.id,
		});

		const organization = await TournamentOrganizationFactory.create({
			ownerId: submitter.id,
		});
		await TrophyFactory.createSubmission(
			{
				organizationId: organization.id,
				submitterUserId: submitter.id,
			},
			{ approverUserIds: [deleted.id] },
		);

		// biome-ignore lint/plugin: no production code path deletes users, the test pins the schemas on-delete behavior
		await db.deleteFrom("User").where("id", "=", deleted.id).execute();

		const orphaned = await db
			.selectFrom("Trophy")
			.select(["creatorId", "managerId"])
			.where("id", "=", trophy.id)
			.executeTakeFirstOrThrow();
		expect(orphaned).toEqual({ creatorId: null, managerId: null });

		expect(
			await db.selectFrom("TrophySubmissionApproval").selectAll().execute(),
		).toEqual([]);
	});
});

async function findTrophyByName(name: string) {
	return (await TrophyRepository.findAllRankedByTier()).find(
		(row) => row.name === name,
	);
}

function findSubmissionWithApprovals(id: number) {
	return TrophyRepository.submissions()
		.where({ id })
		.withApprovals()
		.executeTakeFirst();
}

async function trophyCount() {
	const { count } = await db
		.selectFrom("Trophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}

const daysFromNow = (days: number) =>
	new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("backfill", () => {
	const users = UserFactory.pool();
	const winnerIds = () => users.ids(4);

	beforeEach(async () => {
		await users.create(8);
	});

	const createFinalized = (
		overrides: Partial<Parameters<typeof TournamentFactory.create>[0]> = {},
	) =>
		TournamentFactory.createPlayed(
			{ authorId: users.id(1), ...overrides },
			{
				tier: 3,
				teamRosters: [winnerIds(), users.ids(8).slice(4)],
				playedOut: "all",
			},
		);

	const ownersOf = (trophyId: number) =>
		db
			.selectFrom("TrophyOwner")
			.select([
				"TrophyOwner.tournamentId",
				"TrophyOwner.userId",
				"TrophyOwner.tier",
			])
			.where("TrophyOwner.trophyId", "=", trophyId)
			.orderBy("TrophyOwner.userId", "asc")
			.execute();

	test("links the trophy to the tournament and awards the chosen players at its tier", async () => {
		const trophy = await TrophyFactory.create();
		const tournament = await createFinalized();

		await TrophyRepository.backfill({
			trophyId: trophy.id,
			awards: [
				{
					tournamentId: tournament.id,
					tournamentTeamId: tournament.teams[0].id,
					userIds: winnerIds().slice(0, 2),
				},
			],
		});

		expect(
			(await TrophyRepository.findTournamentsByTrophyId(trophy.id)).map(
				(row) => row.tournamentId,
			),
		).toEqual([tournament.id]);
		expect(await ownersOf(trophy.id)).toEqual(
			winnerIds()
				.slice(0, 2)
				.map((userId) => ({ tournamentId: tournament.id, userId, tier: 3 })),
		);
	});

	test("awards nothing when one of the tournaments already has a trophy", async () => {
		const trophy = await TrophyFactory.create();
		const otherTrophy = await TrophyFactory.create();
		const withoutTrophy = await createFinalized();
		const withTrophy = await createFinalized({ trophyId: otherTrophy.id });

		await expect(
			TrophyRepository.backfill({
				trophyId: trophy.id,
				awards: [withoutTrophy, withTrophy].map((tournament) => ({
					tournamentId: tournament.id,
					tournamentTeamId: tournament.teams[0].id,
					userIds: winnerIds(),
				})),
			}),
		).rejects.toThrow(ConcurrentModificationError);

		expect(await TrophyRepository.findTournamentsByTrophyId(trophy.id)).toEqual(
			[],
		);
		expect(await ownersOf(trophy.id)).toEqual([]);
	});
});

describe("X Power trophies", () => {
	const SPLATTERSHOT = 40;
	const SPLASH_O_MATIC = 20;
	const SPLAT_CHARGER = 2010;

	const users = UserFactory.pool();
	const playerId = () => users.id(1);
	const otherPlayerId = () => users.id(2);

	let trophyIdByCode: Map<string, number>;

	beforeEach(async () => {
		await users.create(2);
		trophyIdByCode = new Map(
			(await TrophyFactory.createXpTrophies()).map((trophy) => [
				trophy.code,
				trophy.id,
			]),
		);
	});

	const place = (args: {
		userId?: number;
		weaponSplId: MainWeaponId;
		power: number;
		region?: "WEST" | "JPN";
	}) =>
		XRankPlacementFactory.create({
			playerUserId: args.userId,
			playerSplId: args.userId ? undefined : "unlinked-player",
			weaponSplId: args.weaponSplId,
			power: args.power,
			...(args.region ? { region: args.region } : {}),
		});

	const ownedCodes = async (userId: number) =>
		(
			await db
				.selectFrom("SpecialTrophyOwner")
				.innerJoin("Trophy", "Trophy.id", "SpecialTrophyOwner.trophyId")
				.select("Trophy.code")
				.where("SpecialTrophyOwner.userId", "=", userId)
				.orderBy("Trophy.code", "asc")
				.execute()
		).map((row) => row.code);

	describe("syncSpecialTrophies", () => {
		test("awards the highest milestone reached per weapon category", async () => {
			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3100,
			});
			await place({
				userId: playerId(),
				weaponSplId: SPLASH_O_MATIC,
				power: 3520,
			});
			await place({
				userId: playerId(),
				weaponSplId: SPLAT_CHARGER,
				power: 3210,
			});

			await TrophyRepository.syncSpecialTrophies();

			expect(await ownedCodes(playerId())).toEqual([
				"xp-chargers-3200",
				"xp-shooters-3500",
			]);
		});

		test("awards nothing below the lowest milestone", async () => {
			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 2999,
			});

			await TrophyRepository.syncSpecialTrophies();

			expect(await ownedCodes(playerId())).toEqual([]);
		});

		test("awards nothing for placements of players no user linked", async () => {
			await place({ weaponSplId: SPLATTERSHOT, power: 3600 });

			await TrophyRepository.syncSpecialTrophies();

			expect(
				await db.selectFrom("SpecialTrophyOwner").select("userId").execute(),
			).toEqual([]);
		});

		test("moves an owner up when they reach a higher milestone", async () => {
			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3100,
			});
			await TrophyRepository.syncSpecialTrophies();

			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3300,
			});
			await TrophyRepository.syncSpecialTrophies();

			expect(await ownedCodes(playerId())).toEqual(["xp-shooters-3200"]);
		});
	});

	describe("findAllByOwnerUserId", () => {
		test("shows the division each X Power trophy was won in, Takoroka over Tentatek", async () => {
			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3620,
				region: "WEST",
			});
			await place({
				userId: playerId(),
				weaponSplId: SPLASH_O_MATIC,
				power: 3540,
				region: "JPN",
			});
			await place({
				userId: playerId(),
				weaponSplId: SPLAT_CHARGER,
				power: 3050,
				region: "WEST",
			});
			await TrophyRepository.syncSpecialTrophies();

			const trophies = await TrophyRepository.findAllByOwnerUserId(playerId());

			expect(
				trophies
					.map((trophy) => ({ code: trophy.code, division: trophy.division }))
					.toSorted((a, b) => (a.code ?? "").localeCompare(b.code ?? "")),
			).toEqual([
				{ code: "xp-chargers-3000", division: "WEST" },
				{ code: "xp-shooters-3500", division: "JPN" },
			]);
		});
	});

	describe("findXpWeaponCountsById", () => {
		test("counts the owners who reached the milestone with each weapon", async () => {
			await place({
				userId: playerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3550,
			});
			await place({
				userId: playerId(),
				weaponSplId: SPLASH_O_MATIC,
				power: 3510,
			});
			await place({
				userId: otherPlayerId(),
				weaponSplId: SPLATTERSHOT,
				power: 3600,
			});
			// below the milestone, so not what got them the trophy
			await place({
				userId: otherPlayerId(),
				weaponSplId: SPLASH_O_MATIC,
				power: 3100,
			});
			await TrophyRepository.syncSpecialTrophies();

			const counts = await TrophyRepository.findXpWeaponCountsById({
				trophyId: trophyIdByCode.get("xp-shooters-3500")!,
				weaponIds: XpTrophy.categoryWeaponIds("shooters"),
				milestone: 3500,
			});

			expect(counts).toEqual([
				{ weaponSplId: SPLATTERSHOT, ownerCount: 2 },
				{ weaponSplId: SPLASH_O_MATIC, ownerCount: 1 },
			]);
		});
	});
});
