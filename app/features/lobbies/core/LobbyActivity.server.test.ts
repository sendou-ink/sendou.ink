import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyActivity from "./LobbyActivity.server";

const users = UserFactory.pool();

const hostId = () => users.id(1);
const signedUpId = () => users.id(2);

describe("LobbyActivity.findByUserId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("a checked in participant is active in the lobby once refreshed", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [signedUpId()], checkedInUserIds: [hostId()] },
		);

		await LobbyActivity.refresh();

		expect(LobbyActivity.findByUserId(hostId())).toMatchObject({
			lobbyId: lobby.id,
			isPlayingSet: false,
		});
		expect(LobbyActivity.findByUserId(signedUpId())).toBeNull();
	});

	test("nobody is active in an ended lobby", async () => {
		await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ checkedInUserIds: [hostId()], isEnded: true },
		);

		await LobbyActivity.refresh();

		expect(LobbyActivity.findByUserId(hostId())).toBeNull();
	});
});

describe("LobbyActivity.findReadyCheckLobbyIdByUserId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("the waitlisted asked to take a spot are waited on until they confirm", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{ signedUpUserIds: [signedUpId()], readyCheckUserIds: [signedUpId()] },
		);
		await LobbyActivity.refresh();
		expect(LobbyActivity.findReadyCheckLobbyIdByUserId(signedUpId())).toBe(
			lobby.id,
		);

		await LobbyMatchRepository.confirmReadyChecks({
			lobbyId: lobby.id,
			userId: signedUpId(),
		});
		await LobbyActivity.refresh();

		expect(
			LobbyActivity.findReadyCheckLobbyIdByUserId(signedUpId()),
		).toBeNull();
	});
});
