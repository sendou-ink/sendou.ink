import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as SQReportedWeaponFactory from "~/db/seed/factories/SQReportedWeaponFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentReportedWeaponFactory from "~/db/seed/factories/TournamentReportedWeaponFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "~/features/mmr/core/Seasons";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { dbReset } from "~/utils/Test";
import * as LeaderboardRepository from "./LeaderboardRepository.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "./leaderboards-constants";

const SEASON = Seasons.currentOrPrevious()!.nth;
const SEASON_RANGE = Seasons.nthToDateRange(SEASON);
const OVER_THRESHOLD = MATCHES_COUNT_NEEDED_FOR_LEADERBOARD + 1;
const IN_SEASON = SEASON_RANGE.starts;
const OUT_OF_SEASON = new Date(SEASON_RANGE.starts.getTime() - 60 * 1000);

let player: { id: number };
let otherPlayer: { id: number };
/** The other players of the SendouQ groups the two report their weapons in. */
let groupFillers: Array<{ id: number }>;

const createSendouqMatch = async (createdAt: Date) => {
	const alpha = await createGroup([
		player,
		otherPlayer,
		...groupFillers.slice(0, 2),
	]);
	const bravo = await createGroup(groupFillers.slice(2));

	// played out so that the groups go inactive and the same users can queue again
	const match = await SQMatchFactory.create(
		{ alphaGroupId: alpha.id, bravoGroupId: bravo.id },
		{ isConcluded: true },
	);
	await backdate("GroupMatch", match.id, { createdAt });

	return match;
};

const createGroup = ([owner, ...members]: Array<{ id: number }>) =>
	SQGroupFactory.create({
		userId: owner.id,
		additionalMemberUserIds: members.map((member) => member.id),
	});

/** A played tournament match, its two teams being the reporter and somebody else. */
const createTournamentMatch = async ({
	authorId,
	isFinalized,
}: {
	authorId: number;
	isFinalized: boolean;
}) => {
	const tournament = await TournamentFactory.create(
		{ authorId, minMembersPerTeam: 1 },
		{ isFinalized },
	);
	await TournamentTeamFactory.createMany(
		2,
		(index) => ({
			tournamentId: tournament.id,
			userId: index === 0 ? authorId : groupFillers[index].id,
		}),
		{ isCheckedIn: true },
	);
	await TournamentFactory.startBracket(tournament.id);

	const [match] = await TournamentFactory.playMatches(tournament.id);

	return match;
};

const reportSendouqWeapons = async (args: {
	userId: number;
	weaponSplId: MainWeaponId;
	count: number;
	matchCreatedAt?: Date;
}) => {
	const match = await createSendouqMatch(args.matchCreatedAt ?? IN_SEASON);

	await SQReportedWeaponFactory.createMany(args.count, (mapIndex) => ({
		groupMatchId: match.id,
		mapIndex,
		userId: args.userId,
		weaponSplId: args.weaponSplId,
	}));
};

const reportTournamentWeapons = async (args: {
	userId: number;
	weaponSplId: MainWeaponId;
	count: number;
	isFinalized?: boolean;
	createdAt?: Date;
}) => {
	const match = await createTournamentMatch({
		authorId: args.userId,
		isFinalized: args.isFinalized ?? true,
	});

	await TournamentReportedWeaponFactory.createMany(args.count, (mapIndex) => ({
		tournamentMatchId: match.id,
		mapIndex,
		userId: args.userId,
		weaponSplId: args.weaponSplId,
		createdAt: dateToDatabaseTimestamp(args.createdAt ?? IN_SEASON),
	}));
};

describe("findSeasonPopularUsersWeapon", () => {
	beforeEach(async () => {
		const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
		[player, otherPlayer, ...groupFillers] = users;
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
			matchCreatedAt: OUT_OF_SEASON,
		});
		await reportTournamentWeapons({
			userId: otherPlayer.id,
			weaponSplId: 1000,
			count: OVER_THRESHOLD,
			createdAt: OUT_OF_SEASON,
		});

		const result =
			await LeaderboardRepository.findSeasonPopularUsersWeapon(SEASON);

		expect(result).toEqual({});
	});
});
