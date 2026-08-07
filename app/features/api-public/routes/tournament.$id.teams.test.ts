import { describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { withUserId, wrappedLoader } from "~/utils/Test";
import type { GetTournamentTeamsResponse } from "../schema";
import { loader } from "./tournament.$id.teams";

const TEAM_NAME = "Team Olive";

const teamsLoader = wrappedLoader<Response>({ loader });

const fetchTeams = async (tournamentId: number) => {
	const response = await teamsLoader({
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

describe("GET /api/tournament/:id/teams", () => {
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
});
