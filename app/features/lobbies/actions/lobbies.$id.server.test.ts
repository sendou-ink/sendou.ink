import { addHours, subMinutes } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId, wrappedAction } from "~/utils/Test";
import * as LobbyActivity from "../core/LobbyActivity.server";
import * as LobbySet from "../core/LobbySet";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import { LOBBIES_CHANNEL } from "../lobbies-constants";
import type { lobbyActionSchema } from "../lobbies-schemas";
import { lobbySearchParams } from "../lobbies-search-params";
import { action } from "./lobbies.$id.server";

vi.mock("~/features/chat/ChatSystemMessage.server", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("~/features/chat/ChatSystemMessage.server")
	>()),
	send: vi.fn(),
}));

const lobbyAction = wrappedAction<typeof lobbyActionSchema>({ action });
const lobbyFormAction = wrappedAction<typeof lobbyActionSchema>({
	action,
	isJsonSubmission: true,
});

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

	test("signing up to a started lobby before check-in opens doesn't check in", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{ signedUpUserIds: users.ids(7).slice(2) },
		);

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === visitorId())
				?.status,
		).toBe("REGISTERED");
	});

	test("the 8th to sign up to a started lobby opens check-in, checked in right away", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{ signedUpUserIds: users.ids(8).slice(2) },
		);

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		const state = await LobbyRepository.findProgressionStateById(lobby.id);
		expect(state?.checkInOpenedAt).not.toBeNull();
		expect(
			state?.participants.find((p) => p.userId === visitorId())?.status,
		).toBe("CHECKED_IN");
	});

	test("signing up to a started lobby with check-in open and room to spare checks in right away", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{
				signedUpUserIds: users.ids(5).slice(2),
				checkedInUserIds: [hostId()],
			},
		);

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === visitorId())
				?.status,
		).toBe("CHECKED_IN");
	});

	test("signing up to a started lobby with check-in open and a full room waitlists", async () => {
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

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: users.id(9), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).find((p) => p.userId === users.id(9))
				?.status,
		).toBe("WAITLISTED");
	});

	test("signing up to a started lobby while in SendouQ is rejected", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{ checkedInUserIds: [hostId()] },
		);
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

	test("signing up to a started lobby while in another lobby is rejected", async () => {
		const startedAt = dateToDatabaseTimestamp(subMinutes(new Date(), 1));
		await LobbyFactory.create(
			{ hostUserId: visitorId(), startsAt: startedAt },
			{ checkedInUserIds: [visitorId()] },
		);
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId(), startsAt: startedAt },
			{ checkedInUserIds: [hostId()] },
		);
		await LobbyActivity.refresh();

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).some((p) => p.userId === visitorId()),
		).toBe(false);
	});

	test("a kicked player can't sign up again", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [visitorId()] },
		);
		await lobbyAction(
			{ _action: "KICK", userId: visitorId() },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(
			(await participantsOf(lobby.id)).some((p) => p.userId === visitorId()),
		).toBe(false);
	});

	test("the host kicks a player who left, taking away the lobby's chat", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [visitorId()] },
		);
		await lobbyAction(
			{ _action: "LEAVE" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		await lobbyAction(
			{ _action: "KICK", userId: visitorId() },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		const found = await withUserId(visitorId(), () =>
			LobbyRepository.findById(lobby.id),
		);
		expect(found?.isViewerKicked).toBe(true);
		expect(found?.hasViewerLeft).toBe(false);
	});

	test("only the host confirms a disputed set", async () => {
		const playerIds = users.ids(8);
		const lobby = await LobbyFactory.create(
			{
				hostUserId: playerIds[0],
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 30)),
			},
			{
				signedUpUserIds: playerIds.slice(1),
				checkedInUserIds: playerIds,
				reportedMapCount: 2,
				isDisputed: true,
			},
		);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const nonHostId = playerIds[1];

		await expect(
			lobbyAction(
				{ _action: "HOST_CONFIRM_SET", setId: set.id },
				{ user: nonHostId, params: { id: String(lobby.id) } },
			),
		).rejects.toBeTruthy();

		await lobbyAction(
			{ _action: "HOST_CONFIRM_SET", setId: set.id },
			{ user: playerIds[0], params: { id: String(lobby.id) } },
		);
		const [confirmed] = await LobbyMatchRepository.findAllSetsByLobbyId(
			lobby.id,
		);
		expect(LobbySet.status(confirmed)).toBe("CONFIRMED");
	});

	test("reporting a map someone else just reported is ignored", async () => {
		const playerIds = users.ids(8);
		const lobby = await LobbyFactory.create(
			{
				hostUserId: playerIds[0],
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 30)),
			},
			{
				signedUpUserIds: playerIds.slice(1),
				checkedInUserIds: playerIds,
				reportedMapCount: 1,
			},
		);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const [firstReporterId, secondReporterId] = LobbySet.playersOf(
			set,
			"ALPHA",
		);
		const report = (userId: number) =>
			lobbyAction(
				{
					_action: "REPORT_MAP",
					setId: set.id,
					winnerSide: "ALPHA",
					reportedCount: 1,
				},
				{ user: userId, params: { id: String(lobby.id) } },
			);

		await report(firstReporterId);

		await expect(report(secondReporterId)).resolves.toBeNull();
		const [decided] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		expect(LobbySet.reportedCount(decided)).toBe(2);
	});

	test("confirming an already confirmed set is ignored", async () => {
		const playerIds = users.ids(8);
		const lobby = await LobbyFactory.create(
			{
				hostUserId: playerIds[0],
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 30)),
			},
			{
				signedUpUserIds: playerIds.slice(1),
				checkedInUserIds: playerIds,
				reportedMapCount: 2,
			},
		);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const [firstConfirmerId, secondConfirmerId] = LobbySet.playersOf(
			set,
			"BRAVO",
		);
		const confirm = (userId: number) =>
			lobbyAction(
				{ _action: "CONFIRM_SET", setId: set.id },
				{ user: userId, params: { id: String(lobby.id) } },
			);

		await confirm(firstConfirmerId);

		await expect(confirm(secondConfirmerId)).resolves.toBeNull();
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

	test("a participant can't make themselves the host", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [visitorId()] },
		);

		await expect(
			lobbyAction(
				{ _action: "MAKE_HOST", userId: visitorId() },
				{ user: visitorId(), params: { id: String(lobby.id) } },
			),
		).rejects.toBeTruthy();
		expect(
			(await LobbyRepository.findProgressionStateById(lobby.id))?.hostUserId,
		).toBe(hostId());
	});

	test("an outsider signs up to a lobby limited to an association through its invite link", async () => {
		const association = await AssociationFactory.create({ userId: hostId() });
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			visibility: { forAssociation: association.id },
		});
		const shareKey = (
			await withUserId(hostId(), () => LobbyRepository.findById(lobby.id))
		)?.shareKey;

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{
				user: visitorId(),
				params: { id: String(lobby.id) },
				url: lobbySearchParams.href("/path", { key: shareKey ?? null }),
			},
		);

		expect(
			(await participantsOf(lobby.id)).some((p) => p.userId === visitorId()),
		).toBe(true);
	});

	test("the host opens a lobby limited to an association to everyone", async () => {
		const association = await AssociationFactory.create({ userId: hostId() });
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			visibility: { forAssociation: association.id },
		});

		await lobbyFormAction(
			{
				_action: "UPDATE_VISIBILITY",
				baseVisibility: "PUBLIC",
				notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
			},
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		expect(
			await withUserId(visitorId(), () => LobbyRepository.findById(lobby.id)),
		).toBeDefined();
	});

	test("widening the visibility after the lobby's start is a field error", async () => {
		const association = await AssociationFactory.create({ userId: hostId() });
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		const result = await lobbyFormAction(
			{
				_action: "UPDATE_VISIBILITY",
				baseVisibility: association.id,
				notFoundVisibility: {
					at: addHours(new Date(), 2),
					forAssociation: "PUBLIC",
				},
			},
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		expect(result).toEqual({
			fieldErrors: { notFoundVisibility: "forms:errors.dateAfterLobbyStart" },
		});
	});

	test("only the host can reset the invite link", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [visitorId()] },
		);
		const shareKeyOf = async () =>
			(await withUserId(hostId(), () => LobbyRepository.findById(lobby.id)))
				?.shareKey;
		const oldShareKey = await shareKeyOf();

		await expect(
			lobbyAction(
				{ _action: "RESET_SHARE_KEY" },
				{ user: visitorId(), params: { id: String(lobby.id) } },
			),
		).rejects.toBeTruthy();
		expect(await shareKeyOf()).toBe(oldShareKey);

		await lobbyAction(
			{ _action: "RESET_SHARE_KEY" },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);
		expect(await shareKeyOf()).not.toBe(oldShareKey);
	});
});

describe("lobby action lobbies list broadcast", () => {
	beforeEach(async () => {
		await users.create(10);
	});

	const sentChannels = () =>
		vi
			.mocked(ChatSystemMessage.send)
			.mock.calls.flat(2)
			.map((broadcast) => broadcast.channel);

	test("signing up refreshes the lobbies list", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });
		vi.mocked(ChatSystemMessage.send).mockClear();

		await lobbyAction(
			{ _action: "SIGN_UP" },
			{ user: visitorId(), params: { id: String(lobby.id) } },
		);

		expect(sentChannels()).toContain(LOBBIES_CHANNEL);
	});

	test("resetting the invite link leaves the lobbies list alone", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });
		vi.mocked(ChatSystemMessage.send).mockClear();

		await lobbyAction(
			{ _action: "RESET_SHARE_KEY" },
			{ user: hostId(), params: { id: String(lobby.id) } },
		);

		expect(sentChannels()).not.toContain(LOBBIES_CHANNEL);
	});
});
