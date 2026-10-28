import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
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
