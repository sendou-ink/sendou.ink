import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as LobbyProgression from "./core/LobbyProgression.server";
import * as LobbySet from "./core/LobbySet";
import * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import * as LobbyRepository from "./LobbyRepository.server";

const users = UserFactory.pool();

const hostId = () => users.id(1);

describe("findAllTeamChatsByChatRoomIds", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test("a player who left is no longer in their team chat", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(8),
			},
		);
		await LobbyProgression.advance(lobby.id);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const { alphaChatRoomId } = (await withUserId(hostId(), () =>
			LobbyRepository.findById(lobby.id),
		))!;
		const [leaverId, ...stayingIds] = LobbySet.playersOf(set, "ALPHA");

		await LobbyRepository.removeParticipant({
			lobbyId: lobby.id,
			userId: leaverId,
			unfinishedSetId: set.id,
		});

		const [teamChat] = await LobbyMatchRepository.findAllTeamChatsByChatRoomIds(
			[alphaChatRoomId!],
		);
		expect(teamChat.userIds).toEqual(expect.arrayContaining(stayingIds));
		expect(teamChat.userIds).toHaveLength(stayingIds.length);
	});
});

describe("confirmReadyChecks", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("confirms nothing with no ready check open", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		expect(
			await LobbyMatchRepository.confirmReadyChecks({
				lobbyId: lobby.id,
				userId: hostId(),
			}),
		).toBe(false);
	});
});
