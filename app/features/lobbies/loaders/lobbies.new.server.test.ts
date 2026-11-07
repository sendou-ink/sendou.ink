import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedLoader } from "~/utils/Test";
import { newLobbyPage } from "~/utils/urls";
import { newLobbySearchParams } from "../lobbies-search-params";
import { loader } from "./lobbies.new.server";

const newLobbyLoader = wrappedLoader<Awaited<ReturnType<typeof loader>>>({
	loader,
});

const users = UserFactory.pool();

const hostId = () => users.id(1);
const participantId = () => users.id(2);
const visitorId = () => users.id(3);

const editUrl = (lobbyId: number) =>
	newLobbySearchParams.href(newLobbyPage(), { lobbyId });

describe("new lobby loader: editing a lobby", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("the host gets the lobby to edit", async () => {
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			name: "Edited 8s",
		});

		const data = await newLobbyLoader({
			user: hostId(),
			url: editUrl(lobby.id),
		});

		expect(data.lobbyToEdit).toMatchObject({
			id: lobby.id,
			name: "Edited 8s",
			hasStarted: false,
			visibility: { baseVisibility: "PUBLIC" },
		});
	});

	test("a started lobby is marked as such", async () => {
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 10)),
		});

		const data = await newLobbyLoader({
			user: hostId(),
			url: editUrl(lobby.id),
		});

		expect(data.lobbyToEdit?.hasStarted).toBe(true);
	});

	test.each([
		{ why: "a participant", userId: participantId },
		{ why: "a visitor", userId: visitorId },
	])("$why can't edit the lobby", async ({ userId }) => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [participantId()] },
		);

		await expect(
			newLobbyLoader({ user: userId(), url: editUrl(lobby.id) }),
		).rejects.toThrow("403");
	});

	test("the host of an ended lobby can't edit it", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ isEnded: true },
		);

		await expect(
			newLobbyLoader({ user: hostId(), url: editUrl(lobby.id) }),
		).rejects.toThrow("403");
	});

	test("an unknown lobby is not found", async () => {
		await expect(
			newLobbyLoader({ user: hostId(), url: editUrl(999_999) }),
		).rejects.toThrow("404");
	});

	test("without a lobby to edit there is none", async () => {
		const data = await newLobbyLoader({ user: hostId(), url: newLobbyPage() });

		expect(data.lobbyToEdit).toBeNull();
	});
});
