import type * as v from "valibot";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import { action as removeMemberApiAction } from "~/features/api-public/routes/tournament.$id.teams.$teamId.remove-member";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { cache } from "~/utils/cache.server";
import type { SerializeFrom } from "~/utils/remix";
import {
	assertResponseErrored,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import { action, loader } from "./to.$id.matches.$mid";

const tournamentMatchAction = wrappedAction<typeof matchSchema>({
	action,
	isJsonSubmission: true,
});
const removeMemberApiActionWrapped = wrappedAction<
	v.GenericSchema<{ userId: number }>
>({
	action: removeMemberApiAction,
	isJsonSubmission: true,
});

const tournamentMatchLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const ROSTER_SIZE = 4;

/** Everybody but the organizer, who is created apart from them for their pinned id. */
const users = UserFactory.pool();

let tournamentId: number;
let matchId: number;
let teamOne: { id: number };
/** Organizes the tournament and plays on team one. Who the actions submit as. */
let organizerId: number;

const matchParams = () => ({ id: String(tournamentId), mid: String(matchId) });

/** Team one's first four members, the ones it fields when it has to pick. */
const activeRoster = () => [organizerId, ...users.ids(ROSTER_SIZE - 1)];

const loadMatchData = () => tournamentMatchLoader({ params: matchParams() });

const reportScoreAction = ({
	position,
	params = matchParams(),
	winnerTeamId = teamOne.id,
}: {
	position: number;
	params?: { id: string; mid: string };
	winnerTeamId?: number;
}) =>
	tournamentMatchAction(
		{
			_action: "REPORT_SCORE",
			position,
			winnerTeamId,
		},
		{ user: "admin", params },
	);

const setActiveRosterAction = (teamId = teamOne.id, roster = activeRoster()) =>
	tournamentMatchAction(
		{
			_action: "SET_ACTIVE_ROSTER",
			roster,
			teamId,
		},
		{ user: "admin", params: matchParams() },
	);

const removeMemberAction = ({
	userId,
	teamId,
}: {
	userId: number;
	teamId: number;
}) =>
	removeMemberApiActionWrapped(
		{ userId },
		{
			user: "admin",
			params: { id: String(tournamentId), teamId: String(teamId) },
		},
	);

const createTournamentTeam = (
	forTournamentId: number,
	memberUserIds: number[],
) =>
	TournamentTeamFactory.create(
		{ tournamentId: forTournamentId, memberUserIds },
		{ isCheckedIn: true },
	);

describe("Tournament match page", () => {
	beforeEach(async () => {
		organizerId = (await UserFactory.createAdmin()).id;
		await users.create(9);

		const tournament = await TournamentFactory.create({
			authorId: organizerId,
		});
		tournamentId = tournament.id;

		// six members, so that team one has subs and a roster to pick from them
		teamOne = await createTournamentTeam(tournamentId, [
			organizerId,
			...users.ids(5),
		]);
		await createTournamentTeam(tournamentId, users.ids(9).slice(5));

		[{ id: matchId }] = await TournamentFactory.startBracket(tournamentId);
	});

	describe("results", () => {
		test("is empty array for new match", async () => {
			const data = await loadMatchData();

			expect(data.results).toBeDefined();
			expect(data.results.length).toBe(0);
		});

		test("returns results for an in-progress match with correct fields", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });

			const data = await loadMatchData();

			expect(data.results.length).toBe(1);

			const result = data.results[0];
			const playing = [...activeRoster(), ...users.ids(9).slice(5)];

			expect(result.stageId).toBe(1);
			expect(result.mode).toBe("SZ");
			expect(
				result.participants.every((participant) =>
					playing.includes(participant.userId),
				),
				"Result participants should only include active roster user ids",
			).toBeTruthy();
			expect(result.ko).toBe(null);
			expect(result.winnerTeamId).toBe(teamOne.id);
		});

		test("returns results for a completed match", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });
			await reportScoreAction({ position: 1 });

			const data = await loadMatchData();

			expect(data.results.length).toBe(2);
		});
	});

	describe("mapList", () => {
		test("returns TO picked map list for match", async () => {
			const data = await loadMatchData();

			expect(data.mapList).toBeDefined();
			expect(data.mapList?.length).toBe(3);
			expect(data.mapList?.[0].source).toBe("TO");
			expect(data.mapList?.[0].mode).toBe("SZ");
			expect(data.mapList?.[0].stageId).toBe(1);
		});
	});

	describe("matchIsOver", () => {
		test("is false for new match", async () => {
			const data = await loadMatchData();

			expect(data.matchIsOver).toBe(false);
		});

		test("is true for a completed match", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });
			await reportScoreAction({ position: 1 });

			const data = await loadMatchData();

			expect(data.matchIsOver).toBe(true);
		});
	});

	describe("undoing a reported score", () => {
		const undoScoreAction = (position: number) =>
			tournamentMatchAction(
				{ _action: "UNDO_REPORT_SCORE", position },
				{ user: "admin", params: matchParams() },
			);

		test("removes the last game of a set still being played", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });

			await undoScoreAction(0);

			expect((await loadMatchData()).results).toHaveLength(0);
		});

		test("returns error once the set is over", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });
			await reportScoreAction({ position: 1 });

			const res = await undoScoreAction(1);

			assertResponseErrored(res);
			const data = await loadMatchData();
			expect(data.results).toHaveLength(2);
			expect(data.matchIsOver).toBe(true);
		});
	});

	describe("active roster", () => {
		test("returns error if submitted active roster contains user id not in the team", async () => {
			const res = await setActiveRosterAction(teamOne.id, [
				...activeRoster().slice(0, ROSTER_SIZE - 1),
				users.id(6),
			]);

			assertResponseErrored(res, "Invalid roster");
		});

		test("returns error if submitted team is of another tournament", async () => {
			const otherTournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			const otherTeam = await createTournamentTeam(
				otherTournament.id,
				users.ids(ROSTER_SIZE),
			);

			const res = await setActiveRosterAction(
				otherTeam.id,
				users.ids(ROSTER_SIZE),
			);

			assertResponseErrored(res, "Invalid team id");
		});

		test("returns error if submitted active roster has the same player twice", async () => {
			const res = await setActiveRosterAction(teamOne.id, [
				organizerId,
				organizerId,
				organizerId,
				organizerId,
			]);

			assertResponseErrored(res);
		});

		test("returns error if submitted active roster is not of correct length", async () => {
			const res = await setActiveRosterAction(
				teamOne.id,
				activeRoster().slice(0, ROSTER_SIZE - 1),
			);

			assertResponseErrored(res, "Invalid roster length");
		});

		test("returns error if trying to report score without active roster", async () => {
			const res = await reportScoreAction({ position: 0 });

			assertResponseErrored(res, "Team one has no active roster");
		});

		test("wipes active roster if member in it removed by tournament admin", async () => {
			await setActiveRosterAction();

			await removeMemberAction({ teamId: teamOne.id, userId: users.id(1) });

			const res = await reportScoreAction({ position: 0 });
			assertResponseErrored(res, "Team one has no active roster");
		});

		test("retains active roster if member removed by tournament admin was not in it", async () => {
			await setActiveRosterAction();

			// team one's sixth member, so not one of the four it fields
			await removeMemberAction({ teamId: teamOne.id, userId: users.id(5) });

			const res = await reportScoreAction({ position: 0 });

			expect(res).toBe(null);
		});

		test("does not require setting active roster if both teams have no subs", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			const subLessTeam = await createTournamentTeam(tournament.id, [
				organizerId,
				...users.ids(ROSTER_SIZE - 1),
			]);
			await createTournamentTeam(
				tournament.id,
				users.ids(ROSTER_SIZE * 2 - 1).slice(3),
			);

			const [match] = await TournamentFactory.startBracket(tournament.id);

			const res = await reportScoreAction({
				position: 0,
				params: { id: String(tournament.id), mid: String(match.id) },
				winnerTeamId: subLessTeam.id,
			});

			expect(res).toBe(null);
		});
	});

	describe("reopening a play all set", () => {
		const PLAY_ALL_MAPS = {
			count: 3,
			type: "PLAY_ALL",
			list: ([1, 2, 3] as const).map((stageId) => ({
				mode: "SZ" as const,
				stageId,
			})),
		} satisfies TournamentFactory.RoundMaps;

		let playAllParams: { id: string; mid: string };
		let teamA: { id: number };
		let teamB: { id: number };

		const reportPlayAllScore = (position: number, winnerTeamId: number) =>
			reportScoreAction({ position, winnerTeamId, params: playAllParams });

		beforeEach(async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			teamA = await createTournamentTeam(tournament.id, users.ids(ROSTER_SIZE));
			teamB = await createTournamentTeam(
				tournament.id,
				users.ids(ROSTER_SIZE * 2).slice(ROSTER_SIZE),
			);

			const [match] = await TournamentFactory.startBracket(tournament.id, {
				maps: PLAY_ALL_MAPS,
			});
			playAllParams = { id: String(tournament.id), mid: String(match.id) };
		});

		test("removes the last game's score when the set loser won the last game", async () => {
			await reportPlayAllScore(0, teamA.id);
			await reportPlayAllScore(1, teamA.id);
			await reportPlayAllScore(2, teamB.id);

			await tournamentMatchAction(
				{ _action: "REOPEN_MATCH" },
				{ user: "admin", params: playAllParams },
			);

			const data = await tournamentMatchLoader({ params: playAllParams });
			const scoreOf = (teamId: number) =>
				[data.match.opponentOne, data.match.opponentTwo].find(
					(opponent) => opponent?.id === teamId,
				)?.score;

			expect(data.results.map((result) => result.winnerTeamId)).toEqual([
				teamA.id,
				teamA.id,
			]);
			expect(scoreOf(teamA.id)).toBe(2);
			expect(scoreOf(teamB.id)).toBe(0);
		});
	});

	describe("pick/ban", () => {
		/** Two maps more than the set's length, so both teams get to ban one. */
		const BAN_2_MAPS = {
			count: 3,
			type: "BEST_OF",
			pickBan: "BAN_2",
			list: ([1, 2, 3, 4, 5] as const).map((stageId) => ({
				mode: "SZ" as const,
				stageId,
			})),
		} satisfies TournamentFactory.RoundMaps;

		let pickBanParams: { id: string; mid: string };
		/** Not the captain of the team whose turn it is to ban. */
		let banningTeamMemberId: number;
		let otherTeamMemberId: number;

		const banAction = (user: number) =>
			tournamentMatchAction(
				{ _action: "BAN_PICK", mode: "SZ", stageId: 1, mapListIndex: 0 },
				{ user, params: pickBanParams },
			);

		beforeEach(async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			const teamA = await createTournamentTeam(
				tournament.id,
				users.ids(ROSTER_SIZE),
			);
			await createTournamentTeam(
				tournament.id,
				users.ids(ROSTER_SIZE * 2).slice(ROSTER_SIZE),
			);

			const [match] = await TournamentFactory.startBracket(tournament.id, {
				maps: BAN_2_MAPS,
			});
			pickBanParams = { id: String(tournament.id), mid: String(match.id) };

			const data = await tournamentMatchLoader({ params: pickBanParams });
			const teamABansFirst = data.match.opponentTwo?.id === teamA.id;

			// second member of a team, so never its captain
			banningTeamMemberId = teamABansFirst
				? users.id(2)
				: users.id(ROSTER_SIZE + 2);
			otherTeamMemberId = teamABansFirst
				? users.id(ROSTER_SIZE + 2)
				: users.id(2);
		});

		test("lets a team member who is not the captain ban", async () => {
			const res = await banAction(banningTeamMemberId);

			expect(res).toBe(null);

			const data = await tournamentMatchLoader({ params: pickBanParams });
			expect(data.pickBanEvents.length).toBe(1);
			expect(data.pickBanEvents[0].type).toBe("BAN");
			expect(data.pickBanEvents[0].stageId).toBe(1);
			expect(
				data.mapList?.map((map) => Boolean(map.bannedByTournamentTeamId)),
			).toEqual([true, false, false, false, false]);
		});

		test("returns error if a BAN_2 ban doesn't say which map list entry it bans", async () => {
			const res = await tournamentMatchAction(
				{ _action: "BAN_PICK", mode: "SZ", stageId: 1 },
				{ user: banningTeamMemberId, params: pickBanParams },
			);

			assertResponseErrored(res, "Map list index is required");
		});

		test("returns error if a member of the team not in turn bans", async () => {
			const res = await banAction(otherTeamMemberId);

			assertResponseErrored(res, "Unauthorized");
		});
	});

	describe("locked match", () => {
		test("returns error when reporting score for a match waiting on previous matches", async () => {
			await setActiveRosterAction();
			// a state an earlier match of a larger bracket puts this row in, not one it was created in
			// biome-ignore lint/plugin: written rather than seeded, see above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentOne: JSON.stringify({ id: null }) })
				.where("id", "=", matchId)
				.execute();

			const res = await reportScoreAction({ position: 0 });

			assertResponseErrored(res, "Match is locked");
		});
	});

	describe("BYE matches", () => {
		// as above: a BYE and a TBD opponent are states the surrounding bracket produces, so written not seeded
		test("404s when accessing a BYE match", async () => {
			// biome-ignore lint/plugin: as above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentTwo: null })
				.where("id", "=", matchId)
				.execute();

			await expect(loadMatchData()).rejects.toThrow("404");
		});

		test("nots 404 when an opponent is a TBD placeholder waiting for an earlier match", async () => {
			// biome-ignore lint/plugin: as above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentTwo: JSON.stringify({ id: null }) })
				.where("id", "=", matchId)
				.execute();

			await expect(loadMatchData()).resolves.toBeDefined();
		});
	});

	describe("league scheduling", () => {
		const startLeagueMatch = async (isRealtime: boolean) => {
			const league = await TournamentFactory.create(
				{ authorId: organizerId },
				{ isLeague: true },
			);
			await createTournamentTeam(league.id, users.ids(ROSTER_SIZE));
			await createTournamentTeam(
				league.id,
				users.ids(ROSTER_SIZE * 2).slice(ROSTER_SIZE),
			);

			const [match] = await TournamentFactory.startBracket(league.id, {
				isRealtime,
			});

			return { id: String(league.id), mid: String(match.id) };
		};

		test.each([
			{ isRealtime: false, hasScheduling: true, phase: "UNSCHEDULED" },
			{ isRealtime: true, hasScheduling: false, phase: "CLOSED" },
		])(
			"a set of a league bracket with isRealtime $isRealtime is $phase",
			async ({ isRealtime, hasScheduling, phase }) => {
				const data = await tournamentMatchLoader({
					params: await startLeagueMatch(isRealtime),
				});

				expect(data.schedule.hasScheduling).toBe(hasScheduling);
				expect(data.schedule.phase).toBe(phase);
			},
		);
	});

	describe("chat rooms", () => {
		const pickupTeamUserIds = () => users.ids(ROSTER_SIZE);
		const opponentUserIds = () => users.ids(ROSTER_SIZE * 2).slice(ROSTER_SIZE);

		/** Team one formed via LFG, so it has a chat room of its own, the opponent too if `opponentIsPickup`. */
		const startMatchWithPickupTeam = async ({
			opponentIsPickup = false,
		} = {}) => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			const createTeam = (
				name: string,
				memberUserIds: number[],
				isPickup: boolean,
			) =>
				TournamentTeamFactory.create(
					{
						tournamentId: tournament.id,
						memberUserIds,
						team: { name, prefersNotToHost: 0, teamId: null },
					},
					{ isCheckedIn: true, isLooking: isPickup },
				);
			await createTeam("Pickup One", pickupTeamUserIds(), true);
			await createTeam("Opponent", opponentUserIds(), opponentIsPickup);

			const [match] = await TournamentFactory.startBracket(tournament.id);

			return { id: String(tournament.id), mid: String(match.id) };
		};

		const surfacedRooms = async (
			user: number,
			options?: Parameters<typeof startMatchWithPickupTeam>[0],
		) => {
			const data = await tournamentMatchLoader({
				user,
				params: await startMatchWithPickupTeam(options),
			});

			return data.chatRooms.map(({ room, autoOpen, label }) => ({
				type: room.type,
				autoOpen,
				label,
			}));
		};

		test("opens a participant's own pickup team chat after the match chat", async () => {
			expect(
				await surfacedRooms(pickupTeamUserIds()[1], { opponentIsPickup: true }),
			).toEqual([
				{ type: "TOURNAMENT_MATCH", autoOpen: true },
				{ type: "TOURNAMENT_TEAM", autoOpen: true },
			]);
		});

		test("opens a registered team's own chat after the match chat too", async () => {
			expect(await surfacedRooms(opponentUserIds()[0])).toEqual([
				{ type: "TOURNAMENT_MATCH", autoOpen: true },
				{ type: "TOURNAMENT_TEAM", autoOpen: true },
			]);
		});

		test("surfaces both team chats read-only to an organizer outside the match", async () => {
			expect(
				await surfacedRooms(organizerId, { opponentIsPickup: true }),
			).toEqual([
				{ type: "TOURNAMENT_MATCH", autoOpen: true },
				{ type: "TOURNAMENT_TEAM", autoOpen: false, label: "Pickup One" },
				{ type: "TOURNAMENT_TEAM", autoOpen: false, label: "Opponent" },
			]);
		});
	});
});

describe("Round robin match page with team picked maps", () => {
	const TEAM_COUNT = 4;

	const ONE_POOL: TournamentSettings["bracketProgression"] = [
		{
			name: "Pool",
			type: "round_robin",
			requiresCheckIn: false,
			settings: { teamsPerGroup: TEAM_COUNT },
		},
	];

	/** Every team picked the same maps, so each match has more shared picks than it has games. */
	const TEAM_PICKS = new MapPool([
		{ mode: "SZ", stageId: 1 },
		{ mode: "SZ", stageId: 2 },
		{ mode: "TC", stageId: 3 },
		{ mode: "TC", stageId: 4 },
		{ mode: "RM", stageId: 5 },
		{ mode: "RM", stageId: 6 },
		{ mode: "CB", stageId: 7 },
		{ mode: "CB", stageId: 8 },
	]);

	let secondRoundMatch: { id: number; teamIds: [number, number] };

	const loadMapList = async () => {
		const data = await tournamentMatchLoader({
			params: { id: String(tournamentId), mid: String(secondRoundMatch.id) },
		});

		return data.mapList?.map((map) => `${map.mode} ${map.stageId}`);
	};

	/** A deploy or the shared LRU cache evicting the entry. */
	const loseServerCache = () => cache.clear();

	const recentlyPlayedCount = async (mapList: string[] | undefined) => {
		const recentlyPlayed = (
			await TournamentTeamRepository.findRecentlyPlayedMapsByIds({
				teamIds: secondRoundMatch.teamIds,
				excludeMatchId: secondRoundMatch.id,
			})
		).flatMap((maps) => maps.map((map) => `${map.mode} ${map.stageId}`));

		return (mapList ?? []).filter((map) => recentlyPlayed.includes(map)).length;
	};

	beforeEach(async () => {
		await users.create(TEAM_COUNT + 1);
		const [organizer, ...teamUserIds] = users.ids(TEAM_COUNT + 1);

		const tournament = await TournamentFactory.create({
			authorId: organizer,
			bracketProgression: ONE_POOL,
			mapPickingStyle: "AUTO",
			minMembersPerTeam: 1,
		});
		tournamentId = tournament.id;

		for (const userId of teamUserIds) {
			await TournamentTeamFactory.create(
				{ tournamentId, memberUserIds: [userId], mapPool: TEAM_PICKS },
				{ isCheckedIn: true },
			);
		}

		await TournamentFactory.startBracket(tournamentId);

		const bracket = (await tournamentFromDB(tournamentId)).bracketByIdx(0)!;
		const secondRound = bracket.data.round.find((round) => round.number === 2)!;
		const match = bracket.data.match.find(
			(candidate) => candidate.roundId === secondRound.id,
		)!;
		secondRoundMatch = {
			id: match.id,
			teamIds: [match.opponent1!.id!, match.opponent2!.id!],
		};
	});

	test("map list is empty while the teams are still to finish the previous round", async () => {
		expect(await loadMapList()).toEqual([]);
	});

	test("map list opened before the teams' earlier round stays the same when the server cache is lost mid-set", async () => {
		await loadMapList();

		await TournamentFactory.playMatches(tournamentId, { roundNumbers: [1] });
		await TournamentFactory.playMatches(tournamentId, {
			matchIds: [secondRoundMatch.id],
			mapCount: 1,
		});

		const shownAfterGameOne = await loadMapList();
		loseServerCache();
		const shownAfterTheCacheIsLost = await loadMapList();

		expect(shownAfterTheCacheIsLost).toEqual(shownAfterGameOne);
	});

	test("map list opened before the teams' earlier round avoids the maps they played there", async () => {
		await loadMapList();
		await TournamentFactory.playMatches(tournamentId, { roundNumbers: [1] });
		const openedBeforeRoundOne = await loadMapList();

		loseServerCache();
		const openedAfterRoundOne = await loadMapList();

		expect(await recentlyPlayedCount(openedBeforeRoundOne)).toBe(
			await recentlyPlayedCount(openedAfterRoundOne),
		);
	});
});
