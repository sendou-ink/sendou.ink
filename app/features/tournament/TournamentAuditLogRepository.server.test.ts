import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { dbInsertUsers, dbReset, withUserId } from "~/utils/Test";
import * as TournamentAuditLogRepository from "./TournamentAuditLogRepository.server";

const createTournament = () =>
	db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createTeam = (tournamentId: number, name: string) =>
	db
		.insertInto("TournamentTeam")
		.values({
			tournamentId,
			name,
			inviteCode: `inv-${tournamentId}-${name}`,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const insertEvent = ({
	actorUserId,
	...args
}: {
	type: Tables["TournamentAuditLog"]["type"];
	actorUserId: number;
	tournamentTeamId: number;
	subjectUserId?: number;
	metadata?: { bracketIdx?: number };
}) =>
	withUserId(actorUserId, () =>
		db
			.transaction()
			.execute((trx) => TournamentAuditLogRepository.insert(trx, args)),
	);

describe("TournamentAuditLogRepository", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("insert creates a stable history row from the live team", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: team.id,
		});

		const teams = await TournamentAuditLogRepository.findTeamsByTournamentId(
			tournament.id,
		);

		expect(teams).toHaveLength(1);
		expect(teams[0].tournamentTeamId).toBe(team.id);
		expect(teams[0].name).toBe("Team Olive");
	});

	test("findByTournamentId returns events newest first with resolved relations", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: team.id,
			subjectUserId: 1,
		});
		await insertEvent({
			type: "MEMBER_ADDED",
			actorUserId: 1,
			tournamentTeamId: team.id,
			subjectUserId: 2,
		});

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events).toHaveLength(2);
		// newest first
		expect(events[0].type).toBe("MEMBER_ADDED");
		expect(events[0].actor?.id).toBe(1);
		expect(events[0].subject?.id).toBe(2);
		expect(events[0].team?.name).toBe("Team Olive");
		expect(events[1].type).toBe("TEAM_REGISTERED");
	});

	test("team name survives the team being deleted", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Team Olive");

		await insertEvent({
			type: "TEAM_UNREGISTERED",
			actorUserId: 1,
			tournamentTeamId: team.id,
		});

		await db
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", team.id)
			.execute();

		const events = await TournamentAuditLogRepository.findByTournamentId({
			tournamentId: tournament.id,
			limit: 30,
			offset: 0,
		});

		expect(events).toHaveLength(1);
		expect(events[0].team?.name).toBe("Team Olive");
	});

	test("a reused team id does not collapse two teams into one history", async () => {
		const tournament = await createTournament();
		const teamA = await createTeam(tournament.id, "Team A");

		await insertEvent({
			type: "TEAM_UNREGISTERED",
			actorUserId: 1,
			tournamentTeamId: teamA.id,
		});

		await db
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", teamA.id)
			.execute();

		const teamB = await createTeam(tournament.id, "Team B");
		// SQLite reuses the highest deleted rowid for the next insert
		expect(teamB.id).toBe(teamA.id);

		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: teamB.id,
		});

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
		const eventByType = new Map(events.map((event) => [event.type, event]));
		expect(eventByType.get("TEAM_UNREGISTERED")?.team?.name).toBe("Team A");
		expect(eventByType.get("TEAM_REGISTERED")?.team?.name).toBe("Team B");
	});

	test("filters by event type and by team", async () => {
		const tournament = await createTournament();
		const teamA = await createTeam(tournament.id, "Team A");
		const teamB = await createTeam(tournament.id, "Team B");

		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: teamA.id,
		});
		await insertEvent({
			type: "TEAM_CHECKED_IN",
			actorUserId: 1,
			tournamentTeamId: teamA.id,
		});
		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: teamB.id,
		});

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

		for (let i = 0; i < 3; i++) {
			await insertEvent({
				type: "TEAM_CHECKED_IN",
				actorUserId: 1,
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
			actorUserId: 1,
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

	test("updateTeamHistoryName keeps the preserved name current", async () => {
		const tournament = await createTournament();
		const team = await createTeam(tournament.id, "Old Name");

		await insertEvent({
			type: "TEAM_REGISTERED",
			actorUserId: 1,
			tournamentTeamId: team.id,
		});

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
