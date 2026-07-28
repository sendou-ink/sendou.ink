import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { TournamentAuditLogMetadata } from "~/db/tables-json";
import { withUserId } from "~/utils/Test";
import * as TournamentAuditLogRepository from "./TournamentAuditLogRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

let actor: { id: number };
let subject: { id: number };

const createTournament = () => TournamentFactory.create({ authorId: actor.id });

/** Registering a team is itself audited, so the team comes with a `TEAM_REGISTERED` event. */
const createTeam = (
	tournamentId: number,
	name: string,
	options?: { isCheckedIn: boolean },
) =>
	TournamentTeamFactory.create(
		{
			tournamentId,
			memberUserIds: [actor.id],
			team: { name, prefersNotToHost: 0, teamId: null },
		},
		options,
	);

const deleteTeam = (tournamentTeamId: number) =>
	withUserId(actor.id, () =>
		TournamentTeamRepository.deleteById(tournamentTeamId),
	);

const insertEvent = ({
	actorUserId,
	...args
}: {
	type: Tables["TournamentAuditLog"]["type"];
	actorUserId: number;
	tournamentTeamId: number;
	subjectUserId?: number;
	metadata?: TournamentAuditLogMetadata;
}) =>
	withUserId(actorUserId, () =>
		db
			.transaction()
			.execute((trx) => TournamentAuditLogRepository.insert(args, trx)),
	);

describe("TournamentAuditLogRepository", () => {
	beforeEach(async () => {
		[actor, subject] = await UserFactory.createMany(3);
	});

	test("insert creates a stable history row from the live team", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		const teams = await TournamentAuditLogRepository.findTeamsByTournamentId(
			tournament.id,
		);

		expect(teams).toHaveLength(1);
		expect(teams[0].tournamentTeamId).toBe(team.id);
		expect(teams[0].name).toBe("Team Olive");
	});

	test("findByTournamentId returns events newest first with resolved relations", async () => {
		const tournament = await createTournament();
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [actor.id, subject.id],
			team: { name: "Team Olive", prefersNotToHost: 0, teamId: null },
		});

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events).toHaveLength(2);
		// newest first
		expect(events[0].type).toBe("MEMBER_ADDED");
		expect(events[0].actor?.id).toBe(actor.id);
		expect(events[0].subject?.id).toBe(subject.id);
		expect(events[0].team?.name).toBe("Team Olive");
		expect(events[1].type).toBe("TEAM_REGISTERED");
	});

	test("team name survives the team being deleted", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await deleteTeam(team.id);

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events[0].type).toBe("TEAM_UNREGISTERED");
		expect(events[0].team?.name).toBe("Team Olive");
	});

	test("a reused team id does not collapse two teams into one history", async () => {
		const tournament = await createTournament();
		const teamA = await createTeam(tournament.id, "Team A");

		await deleteTeam(teamA.id);

		const teamB = await createTeam(tournament.id, "Team B");
		// SQLite reuses the highest deleted rowid for the next insert
		expect(teamB.id).toBe(teamA.id);

		const teams = await TournamentAuditLogRepository.findTeamsByTournamentId(
			tournament.id,
		);
		expect(teams).toHaveLength(2);
		expect(teams.map((team) => team.name).sort()).toEqual(["Team A", "Team B"]);

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});
		const unregistered = events.find(
			(event) => event.type === "TEAM_UNREGISTERED",
		);
		const registered = events.filter(
			(event) => event.type === "TEAM_REGISTERED",
		);
		expect(unregistered?.team?.name).toBe("Team A");
		// newest first
		expect(registered.map((event) => event.team?.name)).toEqual([
			"Team B",
			"Team A",
		]);
	});

	test("filters by event type and by team", async () => {
		const tournament = await createTournament();
		const teamA = await createTeam(tournament.id, "Team A", {
			isCheckedIn: true,
		});
		await createTeam(tournament.id, "Team B");

		const byType = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			type: "TEAM_REGISTERED",
			limit: 30,
			offset: 0,
		});
		expect(byType).toHaveLength(2);

		const teams = await TournamentAuditLogRepository.findTeamsByTournamentId(
			tournament.id,
		);
		const teamAHistoryId = teams.find(
			(team) => team.tournamentTeamId === teamA.id,
		)?.id;

		const byTeam = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			tournamentTeamHistoryId: teamAHistoryId,
			limit: 30,
			offset: 0,
		});
		expect(byTeam).toHaveLength(2);

		const count = await TournamentAuditLogRepository.countByTournamentId({
			tournamentId: tournament.id,
			type: "TEAM_REGISTERED",
		});
		expect(count).toBe(2);
	});

	test("paginates via limit and offset", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		// two more on top of the team's own TEAM_REGISTERED
		for (let i = 0; i < 2; i++) {
			await insertEvent({
				type: "TEAM_CHECKED_IN",
				actorUserId: actor.id,
				tournamentTeamId: team.id,
			});
		}

		const firstPage = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 2,
			offset: 0,
		});
		const secondPage = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 2,
			offset: 2,
		});

		expect(firstPage).toHaveLength(2);
		expect(secondPage).toHaveLength(1);
	});

	test("stores and reads back metadata", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await insertEvent({
			type: "TEAM_CHECKED_IN",
			actorUserId: actor.id,
			tournamentTeamId: team.id,
			metadata: { bracketIdx: 2 },
		});

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events[0].metadata?.bracketIdx).toBe(2);
	});

	test("stores and reads back the in-game name for name change events", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await insertEvent({
			type: "UPDATE_IN_GAME_NAME",
			actorUserId: actor.id,
			tournamentTeamId: team.id,
			subjectUserId: subject.id,
			metadata: { inGameName: "New IGN#1234" },
		});

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events[0].type).toBe("UPDATE_IN_GAME_NAME");
		expect(events[0].subject?.id).toBe(subject.id);
		expect(events[0].metadata?.inGameName).toBe("New IGN#1234");
	});

	test("updateTeamHistoryName keeps the preserved name current", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Old Name");

		await db.transaction().execute((trx) =>
			TournamentAuditLogRepository.updateTeamHistoryName(trx, {
				tournamentTeamId: team.id,
				name: "New Name",
			}),
		);

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events[0].team?.name).toBe("New Name");
	});
});
