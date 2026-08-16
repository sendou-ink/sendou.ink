import { describe, expect, test } from "vitest";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as Matches from "./core/Matches";
import type { IngestableGame } from "./core/Scoreboards";
import { NAMES, scannerMatch, WEAPONS } from "./core/tests/fixtures";
import * as ScannerIngestRepository from "./ScannerIngestRepository.server";

const PLAYED_AT = Date.UTC(2026, 7, 1, 18, 0, 0);
/** enough teams for the bracket winner to play more than one match */
const TOURNAMENT_TEAM_COUNT = 4;

describe("addOrMergeMatches", () => {
	test("inserts a fresh match with hash, hints and playedAt", async () => {
		const user = await UserFactory.create();
		const { match: groupMatch } = await setupSendouqMatch();

		const result = await ScannerIngestRepository.addOrMergeMatches({
			povUserId: user.id,
			submitterUserId: user.id,
			matches: [testMatch()],
			context: { type: "sendouq", groupMatchId: groupMatch.id },
		});

		expect(result.insertedCount).toBe(1);
		expect(result.mergedCount).toBe(0);
		expect(result.effectiveMatches).toHaveLength(1);

		const rows = await fetchIngestedMatches();
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(result.effectiveMatches[0].id);
		expect(rows[0].povUserId).toBe(user.id);
		expect(rows[0].submitterUserId).toBe(user.id);
		expect(rows[0].playedAt).toBe(Math.floor(PLAYED_AT / 1000));
		expect(rows[0].matchHash).toMatch(/^[0-9a-f]{64}$/);
		expect(rows[0].groupMatchIdHint).toBe(groupMatch.id);
		expect(rows[0].tournamentIdHint).toBeNull();
		expect(rows[0].data).toEqual(Matches.canonicalMatch(testMatch()));
	});

	test("identical resend is a no-op that backfills missing hints", async () => {
		const user = await UserFactory.create();
		const { match: groupMatch } = await setupSendouqMatch();

		const first = await ScannerIngestRepository.addOrMergeMatches({
			povUserId: user.id,
			submitterUserId: user.id,
			matches: [testMatch()],
			context: null,
		});
		expect((await fetchIngestedMatches())[0].groupMatchIdHint).toBeNull();

		const second = await ScannerIngestRepository.addOrMergeMatches({
			povUserId: user.id,
			submitterUserId: user.id,
			matches: [testMatch()],
			context: { type: "sendouq", groupMatchId: groupMatch.id },
		});

		expect(second.insertedCount).toBe(0);
		expect(second.mergedCount).toBe(0);
		expect(second.effectiveMatches[0].id).toBe(first.effectiveMatches[0].id);

		const rows = await fetchIngestedMatches();
		expect(rows).toHaveLength(1);
		expect(rows[0].groupMatchIdHint).toBe(groupMatch.id);
	});

	test("a fuller re-send of the same game merges into the stored partial", async () => {
		const user = await UserFactory.create();
		const partial = testMatch({
			playedAt: PLAYED_AT + 5 * 60 * 1000,
			mode: null,
			matchScores: null,
			teams: [{ players: [] }, { players: [] }],
			winner: null,
		});

		const first = await ScannerIngestRepository.addOrMergeMatches({
			povUserId: user.id,
			submitterUserId: user.id,
			matches: [partial],
			context: null,
		});
		expect(first.insertedCount).toBe(1);
		const storedHash = (await fetchIngestedMatches())[0].matchHash;

		const second = await ScannerIngestRepository.addOrMergeMatches({
			povUserId: user.id,
			submitterUserId: user.id,
			matches: [testMatch()],
			context: null,
		});

		expect(second.insertedCount).toBe(0);
		expect(second.mergedCount).toBe(1);
		expect(second.effectiveMatches[0].id).toBe(first.effectiveMatches[0].id);
		expect(second.effectiveMatches[0].data.mode).toBe("SZ");

		const rows = await fetchIngestedMatches();
		expect(rows).toHaveLength(1);
		expect(rows[0].data.mode).toBe("SZ");
		expect(rows[0].data.winner).toBe(0);
		expect(rows[0].data.teams[0].players.map((p) => p.name)).toEqual(
			NAMES.slice(0, 4),
		);
		expect(rows[0].playedAt).toBe(Math.floor(partial.playedAt! / 1000));
		expect(rows[0].matchHash).not.toBe(storedHash);
	});
});

describe("addLinks", () => {
	test("creates link rows for group match maps", async () => {
		const user = await UserFactory.create();
		const { maps } = await setupSendouqMatch();

		const { effectiveMatches } =
			await ScannerIngestRepository.addOrMergeMatches({
				povUserId: null,
				submitterUserId: user.id,
				matches: [
					testMatch(),
					testMatch({ playedAt: PLAYED_AT + 60 * 60 * 1000, stage: 1 }),
				],
				context: null,
			});

		const linkedCount = await ScannerIngestRepository.addLinks({
			links: effectiveMatches.map((effective, i) => ({
				ingestedMatchId: effective.id,
				match: effective.data,
				game: sendouqGame(maps[i]),
			})),
			povUserId: null,
		});

		expect(linkedCount).toBe(2);
		const links = await fetchLinks();
		expect(links).toHaveLength(2);
		expect(links.map((link) => link.ingestedMatchId)).toEqual(
			effectiveMatches.map((effective) => effective.id),
		);
		expect(links.map((link) => link.groupMatchMapId)).toEqual(
			maps.slice(0, 2).map((map) => map.id),
		);
		expect(
			links.every((link) => link.tournamentMatchGameResultId === null),
		).toBe(true);
		expect(await fetchReportedWeapons()).toHaveLength(0);
	});

	test("re-sends are no-ops and only newly created links are counted", async () => {
		const user = await UserFactory.create();
		const { maps } = await setupSendouqMatch();

		const { effectiveMatches } =
			await ScannerIngestRepository.addOrMergeMatches({
				povUserId: null,
				submitterUserId: user.id,
				matches: [
					testMatch(),
					testMatch({ playedAt: PLAYED_AT + 60 * 60 * 1000, stage: 1 }),
				],
				context: null,
			});
		const links = effectiveMatches.map((effective, i) => ({
			ingestedMatchId: effective.id,
			match: effective.data,
			game: sendouqGame(maps[i]),
		}));

		await ScannerIngestRepository.addLinks({
			links: [links[0]],
			povUserId: null,
		});
		const secondCount = await ScannerIngestRepository.addLinks({
			links,
			povUserId: null,
		});

		expect(secondCount).toBe(1);
		expect(await fetchLinks()).toHaveLength(2);
	});

	test("reports the POV player's weapon once", async () => {
		const povUser = await UserFactory.create();
		const { match: groupMatch, maps } = await setupSendouqMatch();

		const { effectiveMatches } =
			await ScannerIngestRepository.addOrMergeMatches({
				povUserId: povUser.id,
				submitterUserId: povUser.id,
				matches: [testMatch({ pov: { team: 0, index: 0 } })],
				context: null,
			});
		const links = [
			{
				ingestedMatchId: effectiveMatches[0].id,
				match: effectiveMatches[0].data,
				game: sendouqGame(maps[0]),
			},
		];

		await ScannerIngestRepository.addLinks({ links, povUserId: povUser.id });
		await ScannerIngestRepository.addLinks({ links, povUserId: povUser.id });

		const reportedWeapons = await fetchReportedWeapons();
		expect(reportedWeapons).toHaveLength(1);
		expect(reportedWeapons[0].groupMatchId).toBe(groupMatch.id);
		expect(reportedWeapons[0].tournamentMatchId).toBeNull();
		expect(reportedWeapons[0].mapIndex).toBe(maps[0].index);
		expect(reportedWeapons[0].userId).toBe(povUser.id);
		expect(reportedWeapons[0].weaponSplId).toBe(WEAPONS[0]);
	});
});

describe("findScoreboardsByGroupMatchId", () => {
	test("derives group-stamped scoreboards for linked reported maps only", async () => {
		const user = await UserFactory.create();
		const { match: groupMatch, maps } = await setupSendouqMatch({
			isConcluded: true,
		});
		const unreportedMap = maps.find((map) => map.winnerGroupId === null)!;

		const { effectiveMatches } =
			await ScannerIngestRepository.addOrMergeMatches({
				povUserId: user.id,
				submitterUserId: user.id,
				matches: [
					testMatch(),
					testMatch({ playedAt: PLAYED_AT + 60 * 60 * 1000, stage: 1 }),
				],
				context: null,
			});
		await ScannerIngestRepository.addLinks({
			links: [
				{
					ingestedMatchId: effectiveMatches[0].id,
					match: effectiveMatches[0].data,
					game: sendouqGame(maps[0]),
				},
				{
					ingestedMatchId: effectiveMatches[1].id,
					match: effectiveMatches[1].data,
					game: sendouqGame(unreportedMap),
				},
			],
			povUserId: user.id,
		});

		const scoreboards =
			await ScannerIngestRepository.findScoreboardsByGroupMatchId(
				groupMatch.id,
			);

		expect(scoreboards).toHaveLength(1);
		expect(scoreboards[0].mapIndex).toBe(maps[0].index);
		// alpha won every map and the ingested winner team holds NAMES w1-w4,
		// so the winner-first rows come out stamped alpha then bravo
		expect(scoreboards[0].data.scores).toEqual([100, 52]);
		expect(scoreboards[0].data.players.map((p) => p.name)).toEqual(NAMES);
		expect(scoreboards[0].data.players.map((p) => p.tournamentTeamId)).toEqual([
			...Array(4).fill(groupMatch.alphaGroup.id),
			...Array(4).fill(groupMatch.bravoGroup.id),
		]);
	});
});

describe("gamesInTournamentMatch", () => {
	test("returns the match's own games only, leaving the rest of the tournament out", async () => {
		const users = await UserFactory.createMany(TOURNAMENT_TEAM_COUNT);
		const tournament = await TournamentFactory.createPlayed(
			{ authorId: users[0]!.id, minMembersPerTeam: 1 },
			{
				teamRosters: users.map((user) => [user.id]),
				playedOut: 0,
			},
		);
		// the bracket winner plays every round on the same map list, so its
		// earlier round's games are the ones a live send could wrongly take
		const [firstMatch, ...laterMatches] = tournament.matches;
		const winnerUserId = users.find(
			(user) =>
				tournament.teams.find((team) => team.id === firstMatch!.winnerTeamId)
					?.memberUserIds[0] === user.id,
		)!.id;

		const games = await ScannerIngestRepository.gamesInTournamentMatch(
			firstMatch!.id,
		);

		expect(games.length).toBeGreaterThan(0);
		expect(
			games.every(
				(game) =>
					game.target.type === "tournament" &&
					game.target.tournamentMatchId === firstMatch!.id,
			),
		).toBe(true);

		// the tournament-wide list is what the walk would otherwise see
		const allGames =
			await ScannerIngestRepository.gamesPlayedByUserInTournament({
				userId: winnerUserId,
				tournamentId: tournament.id,
			});
		expect(allGames.length).toBeGreaterThan(games.length);
		expect(
			allGames.some(
				(game) =>
					game.target.type === "tournament" &&
					laterMatches.some(
						(match) =>
							game.target.type === "tournament" &&
							game.target.tournamentMatchId === match.id,
					),
			),
		).toBe(true);
	});
});

/** The default roster's match, stamped with the fixed PLAYED_AT this suite asserts on. */
function testMatch(partial: Partial<ScannerMatch> = {}): ScannerMatch {
	return scannerMatch({ playedAt: PLAYED_AT, ...partial });
}

async function setupSendouqMatch(options: { isConcluded?: boolean } = {}) {
	const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
	const match = await SQMatchFactory.create(
		{
			alphaUserIds: users.slice(0, FULL_GROUP_SIZE).map((user) => user.id),
			bravoUserIds: users.slice(FULL_GROUP_SIZE).map((user) => user.id),
		},
		options,
	);

	const maps = await db
		.selectFrom("GroupMatchMap")
		.selectAll()
		.where("matchId", "=", match.id)
		.orderBy("index", "asc")
		.execute();

	return { match, maps };
}

function fetchIngestedMatches() {
	return db
		.selectFrom("IngestedMatch")
		.selectAll()
		.orderBy("id", "asc")
		.execute();
}

function fetchLinks() {
	return db
		.selectFrom("IngestedMatchLink")
		.selectAll()
		.orderBy("id", "asc")
		.execute();
}

function fetchReportedWeapons() {
	return db.selectFrom("ReportedWeapon").selectAll().execute();
}

function sendouqGame(map: {
	id: number;
	matchId: number;
	index: number;
	mode: IngestableGame["mode"];
	stageId: IngestableGame["stageId"];
}): IngestableGame {
	return {
		target: {
			type: "sendouq",
			groupMatchMapId: map.id,
			groupMatchId: map.matchId,
		},
		mapIndex: map.index,
		mode: map.mode,
		stageId: map.stageId,
		winnerUserIds: [],
		loserUserIds: [],
		winnerInGameNames: [],
		loserInGameNames: [],
		playedAt: Math.floor(PLAYED_AT / 1000),
		linkedPlayerNames: null,
	};
}
