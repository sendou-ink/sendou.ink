import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { tournamentJoinSearchParams } from "../tournament-search-params";
import { action as joinAction } from "./to.$id.join.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

const join = wrappedAction({ action: joinAction });

const joinWithInviteOf = async ({
	tournamentId,
	teamId,
	userId,
}: {
	tournamentId: number;
	teamId: number;
	userId: number;
}) => {
	const { inviteCode } = await db
		.selectFrom("TournamentTeam")
		.select("inviteCode")
		.where("id", "=", teamId)
		.executeTakeFirstOrThrow();

	return join(
		{},
		{
			user: userId,
			params: { id: String(tournamentId) },
			url: tournamentJoinSearchParams.href(`/to/${tournamentId}/join`, {
				code: inviteCode,
			}),
		},
	);
};

const users = UserFactory.pool();
const subId = () => users.id(9);

describe("join action", () => {
	beforeEach(async () => {
		await users.create(9);
	});

	test("a player whose team never checked in can sub for another team after the start", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		const needsSub = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: users.ids(4) },
			{ isCheckedIn: true },
		);
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: users.ids(8).slice(4) },
			{ isCheckedIn: true },
		);
		const notCheckedIn = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [subId()],
		});

		await TournamentFactory.startBracket(tournament.id);

		expect(
			(await tournamentFromDB(tournament.id)).teamMemberOfByUser({
				id: subId(),
			}),
		).toBeNull();

		const response = await joinWithInviteOf({
			tournamentId: tournament.id,
			teamId: needsSub.id,
			userId: subId(),
		});

		expect(response.status).toBe(302);
		const subTeamIds = await db
			.selectFrom("TournamentTeamMember")
			.select("tournamentTeamId")
			.where("userId", "=", subId())
			.execute();
		expect(subTeamIds.map((row) => row.tournamentTeamId)).toEqual(
			expect.arrayContaining([needsSub.id, notCheckedIn.id]),
		);
		expect(subTeamIds).toHaveLength(2);
	});

	test("a player on a checked-in team can't join another team after the start", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		const needsSub = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: users.ids(4) },
			{ isCheckedIn: true },
		);
		await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: [...users.ids(8).slice(4), subId()],
			},
			{ isCheckedIn: true },
		);

		await TournamentFactory.startBracket(tournament.id);

		const response = await joinWithInviteOf({
			tournamentId: tournament.id,
			teamId: needsSub.id,
			userId: subId(),
		});

		assertResponseErrored(
			response,
			"Leave your current team before joining another",
		);
	});
});
