import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchScheduleFactory from "~/db/seed/factories/TournamentMatchScheduleFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { databaseTimestampNow } from "~/utils/dates";
import * as TournamentMatchRepository from "./TournamentMatchRepository.server";

const TEAMS_PER_POOL = 2;
const TEAM_COUNT = 4;
const POOL_COUNT = TEAM_COUNT / TEAMS_PER_POOL;

/** Pools of two teams each, followed by a final between the two pool winners. */
const POOLS_TO_FINAL: TournamentSettings["bracketProgression"] = [
	{
		name: "Pools",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: TEAMS_PER_POOL },
	},
	{
		name: "Final",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
		sources: [{ bracketIdx: 0, placements: [1] }],
	},
];

const users = UserFactory.pool();

describe("findByTournamentTeamId", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	test("preserves stage order: matches from an earlier stage come first even when later stage has lower group numbers", async () => {
		// pools are groups 1..2 while the final is group 1 of its own stage, so order by stage before group
		const tournament = await TournamentFactory.createPlayed(
			{
				authorId: users.id(1),
				bracketProgression: POOLS_TO_FINAL,
				minMembersPerTeam: 1,
			},
			{
				teamRosters: users.ids(TEAM_COUNT).map((userId) => [userId]),
				playedOut: [0, 1],
			},
		);
		const poolMatches = tournament.matches.filter(
			(match) => match.bracketIdx === 0,
		);
		const finalMatch = tournament.matches.find(
			(match) => match.bracketIdx === 1,
		)!;

		const lastPoolMatch = poolMatches.find(
			(match) => match.groupNumber === POOL_COUNT,
		)!;

		const result = await TournamentMatchRepository.findByTournamentTeamId(
			lastPoolMatch.winnerTeamId,
		);

		expect(result.map((s) => s.tournamentMatchId)).toEqual([
			lastPoolMatch.id,
			finalMatch.id,
		]);
	});

	test("resolves which side of the match the team is on", async () => {
		const tournament = await TournamentFactory.createPlayed(
			{ authorId: users.id(1), minMembersPerTeam: 1 },
			{ teamRosters: [[users.id(1)], [users.id(2)]] },
		);
		const match = tournament.matches[0];

		const [winnerSet] = await TournamentMatchRepository.findByTournamentTeamId(
			match.winnerTeamId,
		);
		const [loserSet] = await TournamentMatchRepository.findByTournamentTeamId(
			match.loserTeamId,
		);

		expect(winnerSet.teamSide).toBe(winnerSet.winnerSide);
		expect(loserSet.teamSide).not.toBe(loserSet.winnerSide);
		expect(winnerSet.teamSide).not.toBe(loserSet.teamSide);
	});
});

const ROUND_ROBIN: TournamentSettings["bracketProgression"] = [
	{
		name: "Groups",
		type: "round_robin",
		requiresCheckIn: false,
		settings: {},
	},
];

const HOUR = 60 * 60;

/** A started one-set league of two single-member teams. */
async function leagueSet() {
	const league = await TournamentFactory.create(
		{
			authorId: users.id(1),
			bracketProgression: ROUND_ROBIN,
			minMembersPerTeam: 1,
		},
		{ isLeague: true },
	);
	const teams: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] = [];
	for (const userId of [users.id(1), users.id(2)]) {
		teams.push(
			await TournamentTeamFactory.create(
				{ tournamentId: league.id, memberUserIds: [userId] },
				{ isCheckedIn: true },
			),
		);
	}
	const [match] = await TournamentFactory.startBracket(league.id);

	return { league, match, teams };
}

describe("scheduleMatch", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("agrees the time and clears both teams' candidates", async () => {
		const { match, teams } = await leagueSet();
		const at = databaseTimestampNow() + HOUR;
		for (const [index, team] of teams.entries()) {
			await TournamentMatchScheduleFactory.propose({
				matchId: match.id,
				tournamentTeamId: team.id,
				authorId: users.id(index + 1),
				proposedAts: [at, at + HOUR],
			});
		}

		await TournamentMatchRepository.scheduleMatch({
			matchId: match.id,
			scheduledAt: at,
			setByOrganizer: false,
		});

		const updated = await TournamentMatchRepository.findMatchById(match.id);
		expect(updated?.scheduledAt).toBe(at);
		expect(updated?.scheduleSetByOrganizer).toBe(0);
		expect(
			await TournamentMatchRepository.findScheduleProposalsByMatchId(match.id),
		).toHaveLength(0);
	});

	test("the organizer's time closes the board", async () => {
		const { match } = await leagueSet();
		const at = databaseTimestampNow() + HOUR;

		await TournamentMatchRepository.scheduleMatch({
			matchId: match.id,
			scheduledAt: at,
			setByOrganizer: true,
		});
		expect(
			(await TournamentMatchRepository.findMatchById(match.id))
				?.scheduleSetByOrganizer,
		).toBe(1);
	});
});

describe("replaceScheduleProposals", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("adds missing times, keeps listed ones and takes the rest off", async () => {
		const { match, teams } = await leagueSet();
		const at = databaseTimestampNow() + HOUR;
		await TournamentMatchScheduleFactory.propose({
			matchId: match.id,
			tournamentTeamId: teams[0].id,
			authorId: users.id(1),
			proposedAts: [at, at + HOUR],
		});

		const added = await TournamentMatchRepository.replaceScheduleProposals({
			matchId: match.id,
			tournamentTeamId: teams[0].id,
			authorId: users.id(1),
			proposedAts: [at, at + 2 * HOUR],
		});

		expect(added).toHaveLength(1);
		const proposals =
			await TournamentMatchRepository.findScheduleProposalsByMatchId(match.id);
		expect(proposals.map((proposal) => proposal.proposedAt)).toEqual([
			at,
			at + 2 * HOUR,
		]);
	});

	test("an empty list takes only that team's candidates off", async () => {
		const { match, teams } = await leagueSet();
		const at = databaseTimestampNow() + HOUR;
		for (const [index, team] of teams.entries()) {
			await TournamentMatchScheduleFactory.propose({
				matchId: match.id,
				tournamentTeamId: team.id,
				authorId: users.id(index + 1),
				proposedAts: [at + index * HOUR],
			});
		}

		await TournamentMatchRepository.replaceScheduleProposals({
			matchId: match.id,
			tournamentTeamId: teams[0].id,
			authorId: users.id(1),
			proposedAts: [],
		});

		const proposals =
			await TournamentMatchRepository.findScheduleProposalsByMatchId(match.id);
		expect(proposals.map((proposal) => proposal.tournamentTeamId)).toEqual([
			teams[1].id,
		]);
	});
});

describe("deleteScheduleProposalsByTeam", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("declining a reschedule takes only the requesting team's candidates off", async () => {
		const { match, teams } = await leagueSet();
		const at = databaseTimestampNow() + HOUR;
		for (const [index, team] of teams.entries()) {
			await TournamentMatchScheduleFactory.propose({
				matchId: match.id,
				tournamentTeamId: team.id,
				authorId: users.id(index + 1),
				proposedAts: [at + index * HOUR],
			});
		}

		const deletedCount =
			await TournamentMatchRepository.deleteScheduleProposalsByTeam({
				matchId: match.id,
				tournamentTeamId: teams[1].id,
			});

		expect(deletedCount).toBe(1);
		const proposals =
			await TournamentMatchRepository.findScheduleProposalsByMatchId(match.id);
		expect(proposals.map((proposal) => proposal.tournamentTeamId)).toEqual([
			teams[0].id,
		]);
		expect(proposals[0].author.id).toBe(users.id(1));
	});
});

describe("findScheduledBetween", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("lists undecided sets agreed inside the window with both rosters", async () => {
		const { match, teams } = await leagueSet();
		const now = databaseTimestampNow();
		await TournamentMatchScheduleFactory.schedule({
			matchId: match.id,
			scheduledAt: now + HOUR / 2,
		});

		const inWindow = await TournamentMatchRepository.findScheduledBetween({
			startsAt: now,
			endsAt: now + HOUR,
		});
		expect(inWindow).toHaveLength(1);
		const ascending = (a: number, b: number) => a - b;
		expect(
			inWindow[0].members.map((member) => member.userId).toSorted(ascending),
		).toEqual([users.id(1), users.id(2)].toSorted(ascending));
		expect(
			[inWindow[0].teamOneId, inWindow[0].teamTwoId].toSorted(ascending),
		).toEqual(teams.map((team) => team.id).toSorted(ascending));

		expect(
			await TournamentMatchRepository.findScheduledBetween({
				startsAt: now + HOUR,
				endsAt: now + 2 * HOUR,
			}),
		).toHaveLength(0);
	});
});
