import { describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type {
	ScannerMatch,
	ScannerMatchTeam,
} from "~/features/scanner/core/scanner-match";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import { linkStoredMatches } from "../core/relink.server";
import {
	ALPHA_NAMES,
	anotherSendouqMatch,
	BRAVO_NAMES,
	createUser,
	daysAgo,
	fetchIngestedMatches,
	fetchLinks,
	fetchReportedWeapons,
	hoursLater,
	ingest,
	minutesAgo,
	qMatchPage,
	renamed,
	scannedGame,
	sendouqWorld,
	tournamentMatchPage,
	tournamentWorld,
	WEAPONS,
} from "./harness";

describe("gating & request filtering", () => {
	test("G2 other lobbies: anarchy and casual matches are skipped entirely", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.povUser, [
			w.scanned(w.maps[0]!, { lobby: "SERIES" }),
			w.scanned(w.maps[1]!, { lobby: "REGULAR" }),
		]);

		expect(res).toEqual({
			storedMatchesCount: 0,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
			linkedMatches: [],
			contextResolved: false,
		});
		expect(await fetchIngestedMatches()).toHaveLength(0);
	});

	test("G3 X battle: stored without a context hint and never linked", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.povUser, [
			w.scanned(w.maps[0]!, { lobby: "X" }),
		]);

		expect(res).toEqual({
			storedMatchesCount: 1,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
			linkedMatches: [],
			contextResolved: false,
		});
		const rows = await fetchIngestedMatches();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.data.lobby).toBe("X");
		expect(rows[0]!.groupMatchIdHint).toBeNull();
		expect(await fetchLinks()).toHaveLength(0);
	});

	test("G4 mixed request keeps indices: X battle stored, private match stored and linked", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.povUser, [
			w.scanned(w.maps[1]!, { lobby: "X" }),
			w.scanned(w.maps[0]!, { lobby: "REGULAR" }),
			w.scanned(w.maps[0]!),
		]);

		expect(res.storedMatchesCount).toBe(2);
		expect(res.linkedMatches).toEqual([
			{ matchIndex: 2, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		const rows = await fetchIngestedMatches();
		expect(new Set(rows.map((row) => row.data.lobby))).toEqual(
			new Set(["PRIVATE", "X"]),
		);
		expect(await fetchLinks()).toHaveLength(1);
	});

	test("G5 implausible values: stats, scores and names the game can't show are stored as unread", async () => {
		const w = await sendouqWorld();
		await w.conclude();
		const scan = w.scanned(w.maps[0]!);
		const [winners, losers] = scan.teams;

		const res = await ingest(w.povUser, [
			{
				...scan,
				matchScores: [99999, -5],
				teams: [
					{
						players: [
							{
								...winners.players[0]!,
								name: "x".repeat(100),
								ka: 1e12,
								d: -3,
								s: 1.5,
								paint: 1.5e300,
							},
							...winners.players.slice(1),
						],
					},
					losers,
				],
			},
		]);
		expect(res.linkedGamesCount).toBe(1);

		const scoreboard = (await qMatchPage(w.match.id)).ingestedScoreboards[0]!;
		expect(scoreboard.data.scores).toEqual([null, null]);
		expect(scoreboard.data.players[0]).toMatchObject({
			name: "",
			ka: null,
			d: null,
			s: null,
			paint: null,
		});
	});

	test("G6 a play time far in the future: stored without one and never linked", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.povUser, [
			w.scanned(w.maps[0]!, { playedAt: 1e300 }),
		]);

		expect(res.storedMatchesCount).toBe(1);
		expect(res.linkedGamesCount).toBe(0);
		const rows = await fetchIngestedMatches();
		expect(rows[0]!.data.playedAt).toBeNull();
	});
});

describe("SendouQ flow", () => {
	test("Q1 live send, map already reported: stored + linked, page shows the scoreboard", async () => {
		const w = await sendouqWorld();
		await w.conclude();
		const scan = w.scanned(w.maps[0]!);

		const res = await ingest(w.povUser, [scan]);
		expect(res.storedMatchesCount).toBe(1);
		expect(res.linkedGamesCount).toBe(1);
		expect(res.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);

		await ingest(w.povUser, [scan]);

		const page = await qMatchPage(w.match.id);
		expect(page.ingestedScoreboards).toHaveLength(1);
		const scoreboard = page.ingestedScoreboards[0]!;
		expect(scoreboard.mapIndex).toBe(0);
		expect(scoreboard.data.players.map((p) => p.name)).toEqual([
			...ALPHA_NAMES,
			...BRAVO_NAMES,
		]);
		expect(scoreboard.data.players.map((p) => p.weaponSplId)).toEqual(WEAPONS);
		expect(scoreboard.data.players[0]).toMatchObject({
			paint: 1000,
			ka: 20,
			d: 0,
			s: 8,
		});
		expect(page.reportedWeapons).toEqual([
			{
				groupMatchId: w.match.id,
				mapIndex: 0,
				userId: w.povUser.id,
				weaponSplId: WEAPONS[0],
			},
		]);
	});

	test("Q2 send before report, resend after: hint first, link on the resend", async () => {
		const w = await sendouqWorld();
		const scan = w.scanned(w.maps[0]!);

		const first = await ingest(w.povUser, [scan]);
		expect(first.storedMatchesCount).toBe(1);
		expect(first.contextResolved).toBe(true);
		expect(first.linkedGamesCount).toBe(0);
		expect(first.linkedMatches).toEqual([]);
		expect((await fetchIngestedMatches())[0]!.groupMatchIdHint).toBe(
			w.match.id,
		);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(0);

		await w.conclude();
		const resend = await ingest(w.povUser, [scan]);
		expect(resend.storedMatchesCount).toBe(0);
		expect(resend.linkedGamesCount).toBe(1);
		expect(resend.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		expect(await fetchIngestedMatches()).toHaveLength(1);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(1);
	});

	test("Q3 whole-scan of a set: each played map links in order, unplayed maps stay bare", async () => {
		const w = await sendouqWorld();
		const maps = await w.conclude();
		const playedMaps = maps.filter((map) => map.winnerGroupId !== null);
		expect(playedMaps).toHaveLength(4);

		const res = await ingest(
			w.povUser,
			playedMaps.map((map) => w.scanned(map)),
		);

		expect(res.linkedGamesCount).toBe(4);
		expect(res.linkedMatches.map((linked) => linked.matchIndex)).toEqual([
			0, 1, 2, 3,
		]);
		expect((await fetchLinks()).map((link) => link.groupMatchMapId)).toEqual(
			playedMaps.map((map) => map.id),
		);
		const page = await qMatchPage(w.match.id);
		expect(page.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([
			0, 1, 2, 3,
		]);
	});

	test("Q4 POV on the losing side: flipped teams still link and derive winner-first", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.bravoUsers[0]!, [
			w.scanned(w.maps[0]!, { seenFrom: "loser" }),
		]);
		expect(res.linkedGamesCount).toBe(1);

		const page = await qMatchPage(w.match.id);
		const scoreboard = page.ingestedScoreboards[0]!;
		expect(scoreboard.data.scores).toEqual([100, 48]);
		expect(scoreboard.data.players.map((p) => p.name)).toEqual([
			...ALPHA_NAMES,
			...BRAVO_NAMES,
		]);
		expect(scoreboard.data.players.map((p) => p.tournamentTeamId)).toEqual([
			...Array(4).fill(w.match.alphaGroup.id),
			...Array(4).fill(w.match.bravoGroup.id),
		]);
		expect(page.reportedWeapons).toEqual([
			{
				groupMatchId: w.match.id,
				mapIndex: 0,
				userId: w.bravoUsers[0]!.id,
				weaponSplId: WEAPONS[4],
			},
		]);
	});

	test("Q5 a POV-less read: stored with its hint but never linked, even with the set's names", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const res = await ingest(w.povUser, [w.scanned(w.maps[0]!, { pov: null })]);

		expect(res.contextResolved).toBe(true);
		expect(res.linkedGamesCount).toBe(0);
		expect((await fetchIngestedMatches())[0]!.groupMatchIdHint).toBe(
			w.match.id,
		);
		expect(await fetchLinks()).toHaveLength(0);
	});

	test("Q6 POV side contradiction: seating the sender on the wrong side blocks the link", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		// bravo lost every map, yet the read claims the sender's seat on the winning rows
		const res = await ingest(w.bravoUsers[0]!, [w.scanned(w.maps[0]!)]);

		expect(res.storedMatchesCount).toBe(1);
		expect(res.contextResolved).toBe(true);
		expect(res.linkedGamesCount).toBe(0);
		expect(res.linkedMatches).toEqual([]);
		expect((await fetchIngestedMatches())[0]!.groupMatchIdHint).toBe(
			w.match.id,
		);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(0);
	});

	test("Q8 unreliable names: garbage names still link through the sender's POV seat", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		const scan = renamed(
			w.scanned(w.maps[0]!),
			(_, rowIndex) => `???${rowIndex + 1}`,
		);
		const res = await ingest(w.povUser, [scan]);

		expect(res.linkedGamesCount).toBe(1);
		expect(res.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		const page = await qMatchPage(w.match.id);
		const scoreboard = page.ingestedScoreboards[0]!;
		expect(scoreboard.data.players.map((p) => p.tournamentTeamId)).toEqual([
			...Array(4).fill(w.match.alphaGroup.id),
			...Array(4).fill(w.match.bravoGroup.id),
		]);
		expect(scoreboard.data.players[0]!.userId).toBe(w.povUser.id);
		expect(page.reportedWeapons).toEqual([
			{
				groupMatchId: w.match.id,
				mapIndex: 0,
				userId: w.povUser.id,
				weaponSplId: WEAPONS[0],
			},
		]);
	});

	test("Q12 a nameless first link: the opponent's named read still joins the game", async () => {
		const w = await sendouqWorld();
		await w.conclude();
		const scan = w.scanned(w.maps[0]!);

		await ingest(w.povUser, [
			{
				...scan,
				teams: [
					{
						players: scan.teams[0].players.map((p) => ({ ...p, name: null })),
					},
					{
						players: scan.teams[1].players.map((p) => ({ ...p, name: null })),
					},
				],
			},
		]);
		const res = await ingest(w.bravoUsers[0]!, [
			w.scanned(w.maps[0]!, { seenFrom: "loser" }),
		]);

		expect(res.linkedGamesCount).toBe(1);
		const scoreboard = (await qMatchPage(w.match.id)).ingestedScoreboards[0]!;
		expect(scoreboard.data.players.map((p) => p.name)).toEqual([
			...ALPHA_NAMES,
			...BRAVO_NAMES,
		]);
		expect(scoreboard.data.players[0]!.userId).toBe(w.povUser.id);
		expect(scoreboard.data.players[4]!.userId).toBe(w.bravoUsers[0]!.id);
	});

	test("Q13 a teammate's recording: the game links, but their weapon isn't credited to the sender", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		// the POV seat is Alpha1's, sent by their teammate Alpha2
		const res = await ingest(w.alphaUsers[1]!, [w.scanned(w.maps[0]!)]);

		expect(res.linkedGamesCount).toBe(1);
		expect(await fetchReportedWeapons()).toHaveLength(0);
	});

	test("Q11 POV read misflagged as cast: the sender's seat still resolves and links their match", async () => {
		const w = await sendouqWorld();
		await w.conclude();

		// a misread status frame can flag POV footage cast while the results
		// screen still pins the sender's own seat
		const res = await ingest(w.povUser, [
			w.scanned(w.maps[0]!, { cast: true, pov: { team: 0, index: 0 } }),
		]);

		expect(res.contextResolved).toBe(true);
		expect(res.linkedGamesCount).toBe(1);
		expect(res.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		expect((await fetchIngestedMatches())[0]!.groupMatchIdHint).toBe(
			w.match.id,
		);
	});

	test("Q9 live send of an earlier set: queueing again afterwards does not capture the read", async () => {
		const w = await sendouqWorld({ createdAt: minutesAgo(90) });
		const maps = await w.conclude(minutesAgo(70));
		const playedMap = maps[0]!;
		await anotherSendouqMatch(w, minutesAgo(60));

		const res = await ingest(w.povUser, [
			w.scanned(playedMap, { playedAt: minutesAgo(85).getTime() }),
		]);

		expect(res.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		expect((await fetchIngestedMatches())[0]!.groupMatchIdHint).toBe(
			w.match.id,
		);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(1);
	});

	test("Q10 the same map twice in one set: the read links to the play it was taken from", async () => {
		const w = await sendouqWorld({
			mapList: [
				{ mode: "SZ", stageId: 1 },
				{ mode: "TC", stageId: 2 },
				{ mode: "RM", stageId: 3 },
				{ mode: "SZ", stageId: 1 },
				{ mode: "CB", stageId: 4 },
				{ mode: "SZ", stageId: 5 },
				{ mode: "TC", stageId: 6 },
			],
		});
		const maps = await w.conclude();
		const replay = maps[3]!;
		expect(replay.mode).toBe(maps[0]!.mode);
		expect(replay.stageId).toBe(maps[0]!.stageId);

		const res = await ingest(w.povUser, [
			w.scanned(replay, {
				playedAt: databaseTimestampToJavascriptTimestamp(replay.reportedAt!),
			}),
		]);

		expect(res.linkedGamesCount).toBe(1);
		expect((await fetchLinks())[0]!.groupMatchMapId).toBe(replay.id);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toEqual([
			expect.objectContaining({ mapIndex: 3 }),
		]);
	});

	test("Q7 content-based fallback: old match resolves from mode+stage history", async () => {
		const createdAt = daysAgo(10);
		const w = await sendouqWorld({ createdAt });
		const playedAt = hoursLater(createdAt, 3).getTime();
		await w.conclude(new Date(playedAt));

		const res = await ingest(w.povUser, [
			w.scanned(w.maps[0]!, { playedAt }),
			w.scanned(w.maps[1]!, { playedAt: playedAt + 5 * 60 * 1000 }),
		]);

		expect(res.contextResolved).toBe(true);
		expect(res.linkedGamesCount).toBe(2);
		expect(res.linkedMatches).toEqual([
			{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
			{ matchIndex: 1, link: { type: "sendouq", groupMatchId: w.match.id } },
		]);
		const page = await qMatchPage(w.match.id);
		expect(page.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([0, 1]);
	});

	test("Q14 send before report: the report links the stored read without a resend", async () => {
		const w = await sendouqWorld();
		const res = await ingest(w.povUser, [w.scanned(w.maps[0]!)]);
		expect(res.linkedGamesCount).toBe(0);

		await SQMatchRepository.reportMapWinner({
			matchId: w.match.id,
			winnerId: w.match.alphaGroup.id,
			reportedByUserId: w.povUser.id,
			reportedCount: 0,
		});
		await linkStoredMatches({ type: "sendouq", groupMatchId: w.match.id });

		const page = await qMatchPage(w.match.id);
		expect(page.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([0]);
		expect(page.reportedWeapons).toEqual([
			{
				groupMatchId: w.match.id,
				mapIndex: 0,
				userId: w.povUser.id,
				weaponSplId: WEAPONS[0],
			},
		]);
	});

	test("Q15 corrected map report: the undo unlinks the read, which relinks only to a report it agrees with", async () => {
		const w = await sendouqWorld();
		const reportFirstMap = async (winnerId: number) => {
			await SQMatchRepository.reportMapWinner({
				matchId: w.match.id,
				winnerId,
				reportedByUserId: w.povUser.id,
				reportedCount: 0,
			});
			await linkStoredMatches({ type: "sendouq", groupMatchId: w.match.id });
		};
		const undoFirstMap = () =>
			SQMatchRepository.undoMapReport({ matchId: w.match.id, mapIndex: 0 });

		await reportFirstMap(w.match.alphaGroup.id);
		await ingest(w.povUser, [w.scanned(w.maps[0]!)]);
		expect(await fetchLinks()).toHaveLength(1);

		await undoFirstMap();
		expect(await fetchLinks()).toHaveLength(0);

		await reportFirstMap(w.match.bravoGroup.id);
		expect(await fetchLinks()).toHaveLength(0);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(0);

		await undoFirstMap();
		await reportFirstMap(w.match.alphaGroup.id);
		expect(await fetchLinks()).toHaveLength(1);
		expect((await qMatchPage(w.match.id)).ingestedScoreboards).toHaveLength(1);
	});
});

describe("tournament flow", () => {
	test("T1 live send links inside the current set only", async () => {
		const w = await tournamentWorld();
		const sets = w.matchesOfTeam(w.championTeamId);
		const round1 = sets[0]!;
		const round2 = sets.at(-1)!;
		const [game1] = await w.games(round2.id);

		const res = await ingest(w.povUser, [w.scanned(game1!)]);

		expect(res.linkedMatches).toEqual([
			{
				matchIndex: 0,
				link: {
					type: "tournament",
					tournamentId: w.tournamentId,
					matchId: round2.id,
				},
			},
		]);
		const round2Page = await tournamentMatchPage(w.tournamentId, round2.id);
		expect(round2Page.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([
			0,
		]);
		const round1Page = await tournamentMatchPage(w.tournamentId, round1.id);
		expect(round1Page.ingestedScoreboards).toHaveLength(0);
	});

	test("T5 live send of an earlier set: the team's next set does not capture the read", async () => {
		const w = await tournamentWorld();
		const [earlierSet, laterSet] = w.matchesOfTeam(w.championTeamId);
		const [game1] = await w.games(earlierSet!.id);

		const res = await ingest(w.povUser, [
			w.scanned(game1!, { playedAt: game1!.playedAt }),
		]);

		expect(res.linkedMatches).toEqual([
			{
				matchIndex: 0,
				link: {
					type: "tournament",
					tournamentId: w.tournamentId,
					matchId: earlierSet!.id,
				},
			},
		]);
		const earlierPage = await tournamentMatchPage(
			w.tournamentId,
			earlierSet!.id,
		);
		expect(earlierPage.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([
			0,
		]);
		const laterPage = await tournamentMatchPage(w.tournamentId, laterSet!.id);
		expect(laterPage.ingestedScoreboards).toHaveLength(0);
	});

	test("T6 the next set starting moments later: the read lands in the set that was played", async () => {
		const w = await tournamentWorld();
		const [earlierSet, laterSet] = w.matchesOfTeam(w.championTeamId);
		const [game1] = await w.games(earlierSet!.id);
		// the next round is created as the finished set gets reported, so it
		// starts inside the read's clock-skew allowance
		const playedAt = w.startedAtOf(laterSet!.id) - 2 * 60 * 1000;

		const res = await ingest(w.povUser, [w.scanned(game1!, { playedAt })]);

		expect(res.linkedMatches).toEqual([
			{
				matchIndex: 0,
				link: {
					type: "tournament",
					tournamentId: w.tournamentId,
					matchId: earlierSet!.id,
				},
			},
		]);
		const laterPage = await tournamentMatchPage(w.tournamentId, laterSet!.id);
		expect(laterPage.ingestedScoreboards).toHaveLength(0);
	});

	test("T2 reads without a play time (VoD) are stored but never linked", async () => {
		const w = await tournamentWorld();
		const [set1] = w.matchesOfTeam(w.championTeamId);
		const games = await w.games(set1!.id);

		const res = await ingest(
			w.povUser,
			games.map((game) => w.scanned(game, { playedAt: null })),
		);

		expect(res.storedMatchesCount).toBe(games.length);
		expect(res.linkedGamesCount).toBe(0);
		expect(res.linkedMatches).toEqual([]);
		const page = await tournamentMatchPage(w.tournamentId, set1!.id);
		expect(page.ingestedScoreboards).toHaveLength(0);
	});

	test("T3 partial then fuller resend: the replay read merges into the stored partial and links", async () => {
		const w = await tournamentWorld();
		const finalMatch = w.matchesOfTeam(w.championTeamId).at(-1)!;
		const [game1] = await w.games(finalMatch.id);
		const partial = w.scanned(game1!, { partial: true });

		const first = await ingest(w.povUser, [partial]);
		expect(first.storedMatchesCount).toBe(1);
		expect(first.contextResolved).toBe(true);
		expect(first.linkedGamesCount).toBe(0);

		const full = w.scanned(game1!, { playedAt: partial.playedAt! + 60_000 });
		const second = await ingest(w.povUser, [full]);

		expect(second.storedMatchesCount).toBe(0);
		expect(second.mergedMatchesCount).toBe(1);
		expect(second.linkedGamesCount).toBe(1);
		expect(await fetchIngestedMatches()).toHaveLength(1);
		const page = await tournamentMatchPage(w.tournamentId, finalMatch.id);
		expect(page.ingestedScoreboards.map((sb) => sb.mapIndex)).toEqual([0]);
	});

	test("T4 cast footage by staff: stored with the tournament hint but not linked", async () => {
		const w = await tournamentWorld();
		const finalMatch = w.matches.at(-1)!;
		await w.cast(finalMatch.id);
		const caster = await createUser();
		await w.staff(caster);
		const games = await w.games(finalMatch.id);

		const res = await ingest(
			caster,
			games.map((game) => w.scanned(game, { cast: true })),
		);

		expect(res.contextResolved).toBe(true);
		expect(res.linkedGamesCount).toBe(0);
		expect(
			(await fetchIngestedMatches()).map((row) => row.tournamentIdHint),
		).toEqual(games.map(() => w.tournamentId));
		expect(await fetchLinks()).toHaveLength(0);
	});

	test("T7 another set's report on the same map: a read of a game the sender didn't play there stays unlinked", async () => {
		const w = await tournamentWorld();
		const finalMatch = w.matches.at(-1)!;
		const [finalGame] = await w.games(finalMatch.id);
		const eliminatedSet = w.matches.find(
			(match) =>
				match.id !== finalMatch.id &&
				match.loserTeamId !== finalMatch.winnerTeamId &&
				match.loserTeamId !== finalMatch.loserTeamId,
		)!;
		const [ownGame] = await w.games(eliminatedSet.id);
		const stranger = w.teams.find(
			(team) => team.id === eliminatedSet.loserTeamId,
		)!;
		// their own game, but read with their seat on the winning side, so
		// nothing of their set takes it and it waits unlinked with the hint
		await ingest({ id: stranger.memberUserIds[0]! }, [
			w.scanned({
				...ownGame!,
				mode: finalGame!.mode,
				stage: finalGame!.stage,
				playedAt: finalGame!.playedAt,
			}),
		]);
		expect((await fetchIngestedMatches())[0]!.tournamentIdHint).toBe(
			w.tournamentId,
		);

		await linkStoredMatches({
			type: "tournament",
			tournamentId: w.tournamentId,
			tournamentMatchId: finalMatch.id,
		});

		expect(await fetchLinks()).toHaveLength(0);
	});

	test("T10 a set's deciding game: the next set its report started doesn't capture the read", async () => {
		const { res, w, decidedSet } = await ingestDecidingGame({
			startOffsetMs: -3 * 60_000,
		});

		expect(res.linkedMatches).toEqual([
			{
				matchIndex: 0,
				link: {
					type: "tournament",
					tournamentId: w.tournamentId,
					matchId: decidedSet.id,
				},
			},
		]);
	});

	test.each([
		{
			why: "starting 15 min before its results",
			startOffsetMs: -15 * 60_000,
			linksDecidedSet: true,
		},
		{
			why: "starting over 15 min before its results",
			startOffsetMs: -15 * 60_000 - 1000,
			linksDecidedSet: false,
		},
		{ why: "without a start", startOffsetMs: null, linksDecidedSet: false },
	])(
		"T11 a set's deciding game read $why: only a start within the game's span anchors its set",
		async ({ startOffsetMs, linksDecidedSet }) => {
			const { res, decidedSet, nextSet } = await ingestDecidingGame({
				startOffsetMs,
			});

			expect(res.linkedMatches.map((linked) => linked.link)).toEqual([
				expect.objectContaining({
					matchId: linksDecidedSet ? decidedSet.id : nextSet.id,
				}),
			]);
		},
	);

	test("T8 undone and re-reported game: the read relinks to the new result without a resend", async () => {
		const w = await tournamentWorld();
		const finalMatch = w.matches.at(-1)!;
		const [game1] = await w.games(finalMatch.id);
		await ingest(w.povUser, [w.scanned(game1!)]);
		const [result] = await TournamentMatchRepository.findResultsByMatchId(
			finalMatch.id,
		);

		await TournamentMatchRepository.deleteResultById(result!.id);
		expect(await fetchLinks()).toHaveLength(0);

		const reReported = await TournamentMatchRepository.insertResult({
			matchId: finalMatch.id,
			mode: result!.mode,
			stageId: result!.stageId,
			reporterId: w.author.id,
			winnerTeamId: result!.winnerTeamId,
			number: 1,
			source: result!.source,
		});
		await db
			.transaction()
			.execute((trx) =>
				TournamentMatchRepository.setParticipants(
					{ resultId: reReported.id, participants: result!.participants },
					trx,
				),
			);
		await linkStoredMatches({
			type: "tournament",
			tournamentId: w.tournamentId,
			tournamentMatchId: finalMatch.id,
		});

		const links = await fetchLinks();
		expect(links.map((link) => link.tournamentMatchGameResultId)).toEqual([
			reReported.id,
		]);
	});

	test("T9 minimaps-only read completed from the battle log: the resend merges into it and links", async () => {
		const w = await tournamentWorld();
		const finalMatch = w.matchesOfTeam(w.championTeamId).at(-1)!;
		const [game1] = await w.games(finalMatch.id);
		const completed = w.scanned(game1!);
		const minimapsOnly: ScannerMatch = {
			...completed,
			playedAt: null,
			lobby: null,
			matchScores: null,
			winner: null,
			pov: null,
			teams: [minimapTeam(completed.teams[0]), minimapTeam(completed.teams[1])],
		};

		await ingest(w.povUser, [minimapsOnly]);
		const res = await ingest(w.povUser, [completed]);

		expect(res.storedMatchesCount).toBe(0);
		expect(res.mergedMatchesCount).toBe(1);
		expect(res.linkedGamesCount).toBe(1);
		expect(await fetchIngestedMatches()).toHaveLength(1);
	});
});

function minimapTeam(team: ScannerMatchTeam): ScannerMatchTeam {
	return {
		players: team.players.map((player) => ({
			...player,
			paint: null,
			ka: null,
			d: null,
			s: null,
		})),
	};
}

describe("response contract & idempotency", () => {
	test("R1 no context: a scrim between unknown players is stored without hints or links", async () => {
		const user = await createUser("Solo1#1111");

		const res = await ingest(user, [
			scannedGame({
				mode: "SZ",
				stage: 1,
				order: 0,
				winnerNames: ["Win1", "Win2", "Win3", "Win4"],
				loserNames: ["Lose1", "Lose2", "Lose3", "Lose4"],
			}),
		]);

		expect(res).toEqual({
			storedMatchesCount: 1,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
			linkedMatches: [],
			contextResolved: false,
		});
		const rows = await fetchIngestedMatches();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.tournamentIdHint).toBeNull();
		expect(rows[0]!.groupMatchIdHint).toBeNull();
	});

	test("R2 double-send is idempotent but still reports where each match belongs", async () => {
		const w = await sendouqWorld();
		await w.conclude();
		const scan = w.scanned(w.maps[0]!);
		await ingest(w.povUser, [scan]);

		const resend = await ingest(w.povUser, [scan]);

		expect(resend).toEqual({
			storedMatchesCount: 0,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
			linkedMatches: [
				{ matchIndex: 0, link: { type: "sendouq", groupMatchId: w.match.id } },
			],
			contextResolved: true,
		});
		expect(await fetchLinks()).toHaveLength(1);
		const page = await qMatchPage(w.match.id);
		expect(page.ingestedScoreboards).toHaveLength(1);
		expect(page.reportedWeapons).toHaveLength(1);
	});
});

async function ingestDecidingGame({
	startOffsetMs,
}: {
	startOffsetMs: number | null;
}) {
	const w = await tournamentWorld();
	const [decidedSet, nextSet] = w.matchesOfTeam(w.championTeamId);
	const decidingGame = (await w.games(decidedSet!.id)).at(-1)!;
	await w.startSetAt(
		decidedSet!.id,
		new Date(decidingGame.playedAt! - 20 * 60_000),
	);
	await w.startSetAt(nextSet!.id, new Date(decidingGame.playedAt!));
	// the results screen shows after the game was already reported
	const playedAt = decidingGame.playedAt! + 25_000;

	const res = await ingest(w.povUser, [
		w.scanned(decidingGame, {
			playedAt,
			startsAt:
				startOffsetMs === null
					? null
					: Math.floor((playedAt + startOffsetMs) / 1000),
			endsAt: Math.floor(playedAt / 1000),
		}),
	]);

	return { res, w, decidedSet: decidedSet!, nextSet: nextSet! };
}
