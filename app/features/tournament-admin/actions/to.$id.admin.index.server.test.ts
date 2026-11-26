import * as R from "remeda";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import {
	tournamentChannel,
	tournamentTeamChannel,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentLFGChannel } from "~/features/tournament-lfg/tournament-lfg-utils";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { invariant } from "~/utils/invariant";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { adminTeamsActionSchema } from "../tournament-admin-schemas";
import { action } from "./to.$id.admin.index.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

const adminTeamsAction = wrappedAction<typeof adminTeamsActionSchema>({
	action,
	isJsonSubmission: true,
});

const TEAM_COUNT = 4;

const users = UserFactory.pool();
const organizerId = () => users.id(TEAM_COUNT + 1);
const otherOrganizerId = () => users.id(TEAM_COUNT + 2);

describe("Admin teams action UNDO_DROP_TEAM_OUT", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 2);
	});

	test("organizer of one tournament cannot undo the drop out of a team of another tournament", async () => {
		const own = await TournamentFactory.create({
			authorId: organizerId(),
			minMembersPerTeam: 1,
		});
		const other = await TournamentFactory.create({
			authorId: otherOrganizerId(),
			minMembersPerTeam: 1,
		});
		const otherTeamIds: number[] = [];
		for (const userId of users.ids(TEAM_COUNT)) {
			const team = await TournamentTeamFactory.create(
				{ tournamentId: other.id, memberUserIds: [userId] },
				{ isCheckedIn: true },
			);
			otherTeamIds.push(team.id);
		}
		await TournamentFactory.startBracket(other.id);
		const droppedTeamId = otherTeamIds[0];
		await adminTeamsAction(
			{ _action: "DROP_TEAM_OUT", teamId: droppedTeamId },
			{ user: otherOrganizerId(), params: { id: String(other.id) } },
		);
		expect(
			(await tournamentFromDB(other.id)).teamById(droppedTeamId)?.droppedOut,
		).toBeTruthy();

		const response = await adminTeamsAction(
			{ _action: "UNDO_DROP_TEAM_OUT", teamId: droppedTeamId },
			{ user: organizerId(), params: { id: String(own.id) } },
		);

		assertResponseErrored(response as Response, "Invalid team id");
		expect(
			(await tournamentFromDB(other.id)).teamById(droppedTeamId)?.droppedOut,
		).toBeTruthy();
	});
});

describe("Admin teams action CHECK_IN and CHECK_OUT", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 2);
		vi.mocked(ChatSystemMessage.send).mockClear();
	});

	test.each(["CHECK_IN", "CHECK_OUT"] as const)(
		"%s refreshes the tournament's live viewers and the team's register page",
		async (_action) => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId(),
				minMembersPerTeam: 1,
			});
			const team = await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: [users.id(1)] },
				{ isCheckedIn: _action === "CHECK_OUT" },
			);

			await adminTeamsAction(
				{ _action, teamId: team.id, bracketIdx: 0 },
				{ user: organizerId(), params: { id: String(tournament.id) } },
			);

			expect(ChatSystemMessage.send).toHaveBeenCalledWith({
				channel: tournamentChannel(tournament.id),
			});
			expect(ChatSystemMessage.send).toHaveBeenCalledWith({
				channel: tournamentTeamChannel({
					tournamentId: tournament.id,
					teamId: team.id,
				}),
			});
		},
	);
});

describe("Admin teams action DELETE_TEAM", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 2);
		vi.mocked(ChatSystemMessage.send).mockClear();
	});

	test("refreshes the tournament's bracket and LFG pages", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			minMembersPerTeam: 1,
		});
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1)],
		});

		await adminTeamsAction(
			{ _action: "DELETE_TEAM", teamId: team.id },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(ChatSystemMessage.send).toHaveBeenCalledWith({
			channel: tournamentChannel(tournament.id),
		});
		expect(ChatSystemMessage.send).toHaveBeenCalledWith({
			channel: tournamentLFGChannel(tournament.id),
		});
	});
});

describe("Admin teams action DROP_TEAM_OUT", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts the next playable match on the station the ended match freed", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createStartedLanTournament({
			authorId: users.id(17),
			teamRosters: R.chunk(users.ids(16), 4),
			stationNames: ["Main stage"],
		});
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		const droppedTeamId = (
			await tournamentFromDB(tournamentId)
		).brackets[0].data.match.find((match) => match.id === first)?.opponent2?.id;
		if (!droppedTeamId) throw new Error("Semifinal has no team");

		await adminTeamsAction(
			{ _action: "DROP_TEAM_OUT", teamId: droppedTeamId },
			{ user: users.id(17), params: { id: String(tournamentId) } },
		);

		expect(
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		).toEqual([
			{ matchId: first, stationId, isAutoAssigned: 0 },
			{ matchId: second, stationId, isAutoAssigned: 1 },
		]);
	});
});

describe("Admin teams action ADD_FAKE_TEAMS", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 2);
		await UserFactory.createFakePlayerPool();
	});

	const addFakeTeams = (tournamentId: number, count: number) =>
		adminTeamsAction(
			{ _action: "ADD_FAKE_TEAMS", count },
			{ user: organizerId(), params: { id: String(tournamentId) } },
		);

	test("adds checked in teams of the format's size with a valid map pool", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			isTest: true,
			minMembersPerTeam: 2,
			mapPickingStyle: "AUTO",
		});

		await addFakeTeams(tournament.id, 3);

		const after = await tournamentFromDB(tournament.id);
		const teamPick = after.teamPickSettings;
		invariant(teamPick, "Expected teams to pick maps");
		const mapPools = await TournamentTeamRepository.findMapPoolsByTeamIds(
			after.ctx.teams.map((team) => team.id),
		);
		expect(after.ctx.teams).toHaveLength(3);
		for (const team of after.ctx.teams) {
			expect(team.memberUserIds).toHaveLength(2);
			expect(team.checkIns).toHaveLength(1);
			expect(
				TeamPick.validateTeamPool({
					mapPool: new MapPool(mapPools.get(team.id) ?? []),
					teamPick,
					pool: after.mapPool,
				}),
			).toBe("VALID");
		}
	});

	test("rejects a tournament that is not a test tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
		});

		const response = await addFakeTeams(tournament.id, 1);

		assertResponseErrored(
			response as Response,
			"Fake teams can only be added to test tournaments",
		);
		expect((await tournamentFromDB(tournament.id)).ctx.teams).toHaveLength(0);
	});

	test("rejects a test tournament that has started", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			isTest: true,
			minMembersPerTeam: 1,
		});
		for (const userId of users.ids(2)) {
			await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: [userId] },
				{ isCheckedIn: true },
			);
		}
		await TournamentFactory.startBracket(tournament.id);

		const response = await addFakeTeams(tournament.id, 1);

		assertResponseErrored(response as Response, "Tournament has started");
		expect((await tournamentFromDB(tournament.id)).ctx.teams).toHaveLength(2);
	});

	test("counts real teams too towards the 256 team cap", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			isTest: true,
			minMembersPerTeam: 1,
		});
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1)],
		});
		await TournamentTeamFactory.createFakeTeams({
			tournamentId: tournament.id,
			count: 254,
		});

		const overCap = await addFakeTeams(tournament.id, 2);
		assertResponseErrored(overCap as Response, "at most 256 teams");

		await addFakeTeams(tournament.id, 1);
		expect((await tournamentFromDB(tournament.id)).ctx.teams).toHaveLength(256);
	});
});

describe("Admin teams action DELETE_FAKE_TEAMS", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 2);
		await UserFactory.createFakePlayerPool();
	});

	test("deletes the fake teams of a test tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			isTest: true,
			minMembersPerTeam: 1,
		});
		const realTeam = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(1)],
		});
		await TournamentTeamFactory.createFakeTeams({
			tournamentId: tournament.id,
			count: 3,
		});

		await adminTeamsAction(
			{ _action: "DELETE_FAKE_TEAMS" },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			(await tournamentFromDB(tournament.id)).ctx.teams.map((team) => team.id),
		).toEqual([realTeam.id]);
	});

	test("rejects a tournament that is not a test tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
		});

		const response = await adminTeamsAction(
			{ _action: "DELETE_FAKE_TEAMS" },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		assertResponseErrored(
			response as Response,
			"Fake teams can only be deleted from test tournaments",
		);
	});
});
