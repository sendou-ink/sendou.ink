import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import * as LobbyRepository from "../LobbyRepository.server";
import type { lobbyActionSchema } from "../lobbies-schemas";
import { action } from "./lobbies.$id.server";

// the progression's fire-and-forget notifications are not under test
vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: () => Promise.resolve(),
}));

const lobbyAction = wrappedAction<typeof lobbyActionSchema>({ action });

const users = UserFactory.pool();

const hostId = () => users.id(1);
const visitorId = () => users.id(2);

const participantsOf = async (lobbyId: number) =>
	(await LobbyRepository.findProgressionStateById(lobbyId))?.participants ?? [];

describe("lobby action", () => {
	beforeEach(async () => {
		await users.create(10);
	});

	test("signs up", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === visitorId())
				?.status,
		).toBe("REGISTERED");
	});

	test("signing up past the room size waitlists", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: users.ids(9).slice(2) },
		);

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === visitorId())
				?.status,
		).toBe("WAITLISTED");
	});

	test("check-in isn't open long before the start", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		await lobbyAction(
			{ _action: "CHECK_IN" },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		expect((await participantsOf(lobby.id))[0].status).toBe("REGISTERED");
	});

	test("checking in at the start with 8 starts the lobby", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(7),
			},
		);

		await lobbyAction(
			{ _action: "CHECK_IN" },
			{ user: users.id(8), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).every((p) => p.status === "IN_ROOM"),
		).toBe(true);
	});

	test("confirming ready with no ready check open doesn't check in", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: users.ids(9).slice(1) },
		);

		await lobbyAction(
			{ _action: "CONFIRM_READY" },
			{ user: users.id(9), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === users.id(9))
				?.status,
		).toBe("WAITLISTED");
	});

	test("signing up to a started lobby while in SendouQ is rejected", async () => {
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
		});
		await SQGroupFactory.create({ memberUserIds: [visitorId()] });
		await refreshSendouQInstance();

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).some((p) => p.userId === visitorId()),
		).toBe(false);
	});

	test("only the host can end the lobby", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [visitorId()] },
		);

		await expect(
			lobbyAction(
				{ _action: "END_LOBBY" },
				{ user: visitorId(), params: { id: String(lobby.id) } },
			),
		).rejects.toBeTruthy();

		await lobbyAction(
			{ _action: "END_LOBBY" },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);
		expect(
			(await LobbyRepository.findProgressionStateById(lobby.id))?.endedAt,
		).not.toBeNull();
	});
});
