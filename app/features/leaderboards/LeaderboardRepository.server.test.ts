import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { dbReset } from "~/utils/Test";
import * as LeaderboardRepository from "./LeaderboardRepository.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "./leaderboards-constants";

const SEASON = Seasons.currentOrPrevious()!.nth;
const SEASON_RANGE = Seasons.nthToDateRange(SEASON);
const OVER_THRESHOLD = MATCHES_COUNT_NEEDED_FOR_LEADERBOARD + 1;
const IN_SEASON_TIMESTAMP = dateToDatabaseTimestamp(SEASON_RANGE.starts);
const OUT_OF_SEASON_TIMESTAMP = dateToDatabaseTimestamp(
	new Date(SEASON_RANGE.starts.getTime() - 60 * 1000),
);

const createGroup = () =>
	db
		.insertInto("Group")
		.values({
			status: "INACTIVE",
			inviteCode: "test-invite-code",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createGroupMatch = async (createdAt: number) => {
	const alphaGroup = await createGroup();
	const bravoGroup = await createGroup();

	return db
		.insertInto("GroupMatch")
		.values({
			alphaGroupId: alphaGroup.id,
			bravoGroupId: bravoGroup.id,
			chatCode: "test-chat-code",
			createdAt,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
};

const createTournamentMatch = async ({
	authorId,
	isFinalized,
}: {
	authorId: number;
	isFinalized: boolean;
}) => {
	const tournament = await TournamentFactory.create(
		{ authorId },
		{ isFinalized },
	);

	const stage = await db
		.insertInto("TournamentStage")
		.values({
			tournamentId: tournament.id,
			name: "Main bracket",
			number: 1,
			type: "double_elimination",
			settings: "{}",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const group = await db
		.insertInto("TournamentGroup")
		.values({ stageId: stage.id, number: 1 })
		.returning("id")
		.executeTakeFirstOrThrow();

	const round = await db
		.insertInto("TournamentRound")
		.values({
			stageId: stage.id,
			groupId: group.id,
			number: 1,
			maps: JSON.stringify({ count: 3, type: "BEST_OF" }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return db
		.insertInto("TournamentMatch")
		.values({
			stageId: stage.id,
			groupId: group.id,
			roundId: round.id,
			number: 1,
			opponentOne: JSON.stringify({ id: null }),
			opponentTwo: JSON.stringify({ id: null }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();
};

const reportSendouqWeapons = async (args: {
	userId: number;
	weaponSplId: MainWeaponId;
	count: number;
	matchCreatedAt?: number;
}) => {
	const match = await createGroupMatch(
		args.matchCreatedAt ?? IN_SEASON_TIMESTAMP,
	);

	await db
		.insertInto("ReportedWeapon")
		.values(
			Array.from({ length: args.count }, (_, mapIndex) => ({
				groupMatchId: match.id,
				mapIndex,
				userId: args.userId,
				weaponSplId: args.weaponSplId,
			})),
		)
		.execute();
};

const reportTournamentWeapons = async (args: {
	userId: number;
	weaponSplId: MainWeaponId;
	count: number;
	isFinalized?: boolean;
	createdAt?: number;
}) => {
	const match = await createTournamentMatch({
		authorId: args.userId,
		isFinalized: args.isFinalized ?? true,
	});

	await db
		.insertInto("ReportedWeapon")
		.values(
			Array.from({ length: args.count }, (_, mapIndex) => ({
				tournamentMatchId: match.id,
				mapIndex,
				userId: args.userId,
				weaponSplId: args.weaponSplId,
				createdAt: args.createdAt ?? IN_SEASON_TIMESTAMP,
			})),
		)
		.execute();
};

describe("findSeasonPopularUsersWeapon", () => {
	let player: { id: number };
	let otherPlayer: { id: number };

	beforeEach(async () => {
		[player, otherPlayer] = await UserFactory.createMany(2);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns user's most reported SendouQ weapon", async () => {
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({ [player.id]: 10 });
	});

	test("requires more reports than the threshold", async () => {
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({});
	});

	test("counts weapons reported in finalized tournaments", async () => {
		await reportTournamentWeapons({
			userId: player.id,
			weaponSplId: 1000,
			count: OVER_THRESHOLD,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({ [player.id]: 1000 });
	});

	test("ignores weapons reported in unfinalized tournaments", async () => {
		await reportTournamentWeapons({
			userId: player.id,
			weaponSplId: 1000,
			count: OVER_THRESHOLD,
			isFinalized: false,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({});
	});

	test("combines SendouQ and tournament reports of the same weapon", async () => {
		const half = Math.ceil(OVER_THRESHOLD / 2);

		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: half,
		});
		await reportTournamentWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD - half,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({ [player.id]: 10 });
	});

	test("picks the most reported weapon across both sources", async () => {
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 0,
			count: OVER_THRESHOLD + 1,
		});
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD - 3,
		});
		await reportTournamentWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD - 3,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({ [player.id]: 10 });
	});

	test("returns weapons of multiple users", async () => {
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD,
		});
		await reportTournamentWeapons({
			userId: otherPlayer.id,
			weaponSplId: 1000,
			count: OVER_THRESHOLD,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({ [player.id]: 10, [otherPlayer.id]: 1000 });
	});

	test("ignores reports outside the season", async () => {
		await reportSendouqWeapons({
			userId: player.id,
			weaponSplId: 10,
			count: OVER_THRESHOLD,
			matchCreatedAt: OUT_OF_SEASON_TIMESTAMP,
		});
		await reportTournamentWeapons({
			userId: otherPlayer.id,
			weaponSplId: 1000,
			count: OVER_THRESHOLD,
			createdAt: OUT_OF_SEASON_TIMESTAMP,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({});
	});
});
