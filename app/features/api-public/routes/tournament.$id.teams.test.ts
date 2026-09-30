import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { type TestUser, withUserId, wrappedLoader } from "~/utils/Test";
import type { GetTournamentTeamsResponse } from "../schema";
import { loader } from "./tournament.$id.teams";

const TEAM_NAME = "Team Olive";

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const captainId = () => users.id(2);
const outsiderId = () => users.id(3);

const teamsLoader = wrappedLoader<Response>({ loader });

/** Fetches as the owner of the API token, or anonymously when no user is given. */
const fetchTeams = async (tournamentId: number, user?: TestUser) => {
	const response = await teamsLoader({
		user,
		params: { id: String(tournamentId) },
	});

	return (await response.json()) as GetTournamentTeamsResponse;
};

const registeredPlayer = async () => {
	const organizer = await UserFactory.create();
	const player = await UserFactory.create({
		discordName: "xXsplatlordXx",
		profile: null,
	});
	const tournament = await TournamentFactory.create({
		authorId: organizer.id,
	});
	const team = await TournamentTeamFactory.create({
		tournamentId: tournament.id,
		memberUserIds: [player.id],
		team: { name: TEAM_NAME, prefersNotToHost: 0, teamId: null },
	});

	return { organizer, player, tournament, team };
};

/** Registers three teams, the second of which never checks in, then starts the bracket. */
const startedTournamentWithNoShow = async () => {
	const tournament = await TournamentFactory.create({ authorId: users.id(1) });

	for (const [index, ownerUserId] of users.ids().slice(1).entries()) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [ownerUserId] },
			{ isCheckedIn: index !== 1 },
		);
	}

	await TournamentFactory.startBracket(tournament.id);

	return { tournament };
};

/** Four one-player teams whose first round the organizer force-ends with no maps reported. */
const tournamentWithWalkovers = async () => {
	const tournament = await TournamentFactory.create({
		authorId: users.id(1),
		minMembersPerTeam: 1,
	});

	for (const userId of users.ids()) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{ isCheckedIn: true },
		);
	}

	await TournamentFactory.startBracket(tournament.id);
	await TournamentFactory.endSets(tournament.id);

	return { tournament };
};

/** A team of the captain with a pickup logo and a map pool, both hidden before the start. */
const teamWithHiddenInfo = async (tournamentArgs?: { isDraft?: boolean }) => {
	const tournament = await TournamentFactory.create({
		authorId: organizerId(),
		...tournamentArgs,
	});
	await TournamentTeamFactory.create(
		{
			tournamentId: tournament.id,
			memberUserIds: [captainId()],
			hasAvatar: true,
			mapPool: new MapPool({ TW: [], SZ: [1, 2], TC: [3, 4], RM: [], CB: [] }),
		},
		{ isCheckedIn: true },
	);

	return { tournament };
};

/** Four one-player teams through a single elimination bracket, the higher seed winning every map. */
const playedTournament = () =>
	TournamentFactory.createPlayed(
		{ authorId: users.id(1), minMembersPerTeam: 1 },
		{ teamRosters: users.ids().map((userId) => [userId]) },
	);

describe("GET /api/tournament/:id/teams", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("responds 404 for a draft tournament to anyone but its organizers", async () => {
		const { tournament } = await teamWithHiddenInfo({ isDraft: true });

		await expect(fetchTeams(tournament.id, outsiderId())).rejects.toThrow(
			"404",
		);
		expect(await fetchTeams(tournament.id, organizerId())).toHaveLength(1);
	});

	test("shows friend codes only to the organizers", async () => {
		const { tournament } = await teamWithHiddenInfo();

		const asOrganizer = await fetchTeams(tournament.id, organizerId());
		const asOutsider = await fetchTeams(tournament.id, outsiderId());

		expect(asOrganizer[0].members[0].friendCode).toEqual(expect.any(String));
		expect(asOutsider[0].members[0].friendCode).toBeNull();
	});

	test("hides map pools and pickup logos before the start from everyone but organizers and the team itself", async () => {
		const { tournament } = await teamWithHiddenInfo();

		const asOrganizer = await fetchTeams(tournament.id, organizerId());
		const asCaptain = await fetchTeams(tournament.id, captainId());
		const asOutsider = await fetchTeams(tournament.id, outsiderId());

		expect(asOrganizer[0].mapPool).toHaveLength(4);
		expect(asOrganizer[0].logoUrl).toEqual(expect.any(String));
		expect(asCaptain[0].mapPool).toHaveLength(4);
		expect(asCaptain[0].logoUrl).toEqual(expect.any(String));
		expect(asOutsider[0].mapPool).toBeNull();
		expect(asOutsider[0].logoUrl).toBeNull();
	});

	test("reveals map pools and pickup logos to everyone once the tournament has started", async () => {
		const { tournament } = await teamWithHiddenInfo();
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [users.id(4)] },
			{ isCheckedIn: true },
		);
		await TournamentFactory.startBracket(tournament.id);

		const asOutsider = await fetchTeams(tournament.id, outsiderId());

		expect(asOutsider[0].mapPool).toHaveLength(4);
		expect(asOutsider[0].logoUrl).toEqual(expect.any(String));
	});

	test("returns the tournament name organizers gave a player instead of their username", async () => {
		const { organizer, player, tournament, team } = await registeredPlayer();

		await withUserId(organizer.id, () =>
			TournamentTeamRepository.upsertRegistration({
				tournamentTeamId: team.id,
				tournamentId: tournament.id,
				name: TEAM_NAME,
				teamId: null,
				avatarImgId: null,
				ownerUserId: player.id,
				ownerChange: null,
				membersToAdd: [],
				membersToRemove: [],
				inGameNameUpdates: [],
				tournamentNameUpdates: [{ userId: player.id, tournamentName: "Riko" }],
			}),
		);

		const teams = await fetchTeams(tournament.id);

		expect(teams[0].members[0].name).toBe("Riko");
	});

	test("falls back to the username of a player without a tournament name", async () => {
		const { tournament } = await registeredPlayer();

		const teams = await fetchTeams(tournament.id);

		expect(teams[0].members[0].name).toBe("xXsplatlordXx");
	});

	test("skips teams that did not check in when numbering the seeds of a started tournament", async () => {
		const { tournament } = await startedTournamentWithNoShow();

		const teams = await fetchTeams(tournament.id);

		expect(teams.map((team) => team.seed)).toEqual([1, null, 2]);
	});

	test("has no placement or stats before the tournament has started", async () => {
		const { tournament } = await registeredPlayer();

		const teams = await fetchTeams(tournament.id);

		expect(teams[0].placement).toBeNull();
		expect(teams[0].stats).toBeNull();
	});

	test("gives a team that did not check in zero stats and no placement", async () => {
		const { tournament } = await startedTournamentWithNoShow();

		const teams = await fetchTeams(tournament.id);

		expect(teams[1].placement).toBeNull();
		expect(teams[1].stats).toEqual({
			setWins: 0,
			setLosses: 0,
			mapWins: 0,
			mapLosses: 0,
		});
	});

	test("counts a walkover with no maps reported as a set win with no maps", async () => {
		const { tournament } = await tournamentWithWalkovers();

		const teams = await fetchTeams(tournament.id);

		expect(teams.map((team) => team.stats)).toEqual([
			{ setWins: 1, setLosses: 0, mapWins: 0, mapLosses: 0 },
			{ setWins: 1, setLosses: 0, mapWins: 0, mapLosses: 0 },
			{ setWins: 0, setLosses: 1, mapWins: 0, mapLosses: 0 },
			{ setWins: 0, setLosses: 1, mapWins: 0, mapLosses: 0 },
		]);
	});

	test("reports set wins, map wins and placement once a tournament has been played", async () => {
		const tournament = await playedTournament();

		const teams = await fetchTeams(tournament.id);

		expect(
			teams.map((team) => ({ placement: team.placement, ...team.stats })),
		).toEqual([
			{ placement: 1, setWins: 2, setLosses: 0, mapWins: 4, mapLosses: 0 },
			{ placement: 2, setWins: 1, setLosses: 1, mapWins: 2, mapLosses: 2 },
			{ placement: 3, setWins: 0, setLosses: 1, mapWins: 0, mapLosses: 2 },
			{ placement: 3, setWins: 0, setLosses: 1, mapWins: 0, mapLosses: 2 },
		]);
	});
});
