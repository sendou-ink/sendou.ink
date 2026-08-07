import { describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { withUserId, wrappedAction } from "~/utils/Test";
import { action } from "./tournament.$id.teams.upsert";

const TEAM_NAME = "Team Olive";

const upsertAction = wrappedAction({ action, isJsonSubmission: true });

const tournamentNameOf = async (userId: number) =>
	(
		await db
			.selectFrom("User")
			.select("User.tournamentName")
			.where("User.id", "=", userId)
			.executeTakeFirstOrThrow()
	).tournamentName;

/** A one player team of a tournament the API token holder organizes, the player named "Riko". */
const namedPlayerTeam = async () => {
	await UserFactory.createAdmin();
	const player = await UserFactory.create();
	const tournament = await TournamentFactory.create({ authorId: ADMIN_ID });
	const team = await TournamentTeamFactory.create({
		tournamentId: tournament.id,
		memberUserIds: [player.id],
		team: { name: TEAM_NAME, prefersNotToHost: 0, teamId: null },
	});

	await withUserId(ADMIN_ID, () =>
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

	return { player, tournament, team };
};

// tournament names are readable through the API but never writable, not even by a
// token holder who is allowed to edit them in the admin form
describe("POST /api/tournament/:id/teams/upsert", () => {
	test("keeps the tournament names of the roster", async () => {
		const { player, tournament, team } = await namedPlayerTeam();

		await upsertAction(
			{
				tournamentTeamId: team.id,
				name: "Renamed Team",
				ownerUserId: player.id,
				members: [{ userId: player.id }],
			},
			{ user: "admin", params: { id: String(tournament.id) } },
		);

		expect(await tournamentNameOf(player.id)).toBe("Riko");
	});

	test("ignores a tournament name submitted for a member", async () => {
		const { player, tournament, team } = await namedPlayerTeam();

		await upsertAction(
			{
				tournamentTeamId: team.id,
				name: TEAM_NAME,
				ownerUserId: player.id,
				members: [{ userId: player.id, tournamentName: "Not Riko" }],
			},
			{ user: "admin", params: { id: String(tournament.id) } },
		);

		expect(await tournamentNameOf(player.id)).toBe("Riko");
	});
});
