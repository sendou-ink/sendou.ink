import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { broadcastActionSchema } from "../broadcast-cast-schemas";
import * as CastChannel from "../core/CastChannel";
import { action as broadcastAction } from "./to.$id.broadcast.$channel.server";

const broadcast = wrappedAction<typeof broadcastActionSchema>({
	action: broadcastAction,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);

const castAccount = {
	platform: "TWITCH" as const,
	account: "sendouink",
	name: "sendouink",
};

const originalBroadcastOrgIds = ServerConfig.broadcastOrgIds;

beforeEach(async () => {
	ServerConfig.broadcastOrgIds = "*";
	await users.create(1);
});

afterEach(() => {
	ServerConfig.broadcastOrgIds = originalBroadcastOrgIds;
});

describe("TAKE", () => {
	test("puts the staged scene on air", async () => {
		const tournamentId = await createTournament();

		const response = await take(tournamentId, { takeId: 0 });

		expect(response).toBeNull();
		const state = await storedState(tournamentId);
		expect(state.takeId).toBe(1);
		expect(state.live.scene).toBe("game");
	});

	test("rejects a Take based on a Take that is no longer the latest", async () => {
		const tournamentId = await createTournament();
		await take(tournamentId, { takeId: 0 });

		const response = await take(tournamentId, { takeId: 0 });

		assertResponseErrored(response, "Someone else already pressed Take");
		const state = await storedState(tournamentId);
		expect(state.takeId).toBe(1);
		expect(state.live.scene).toBe("game");
	});

	test("rejects a Take of a scene showing the match while none is cast", async () => {
		const tournamentId = await createTournament();
		await broadcast(
			{ _action: "SET_SCENE", itemId: 2, scene: "rosters" },
			{ user: organizerId(), params: params(tournamentId) },
		);

		const response = await take(tournamentId, { takeId: 0 });

		assertResponseErrored(response, "no match is cast on this channel");
		const state = await storedState(tournamentId);
		expect(state.takeId).toBe(0);
		expect(state.next.scene).toBe("rosters");
	});
});

async function createTournament() {
	const { id } = await TournamentFactory.create(
		{ authorId: organizerId() },
		{ castAccounts: [castAccount] },
	);

	return id;
}

function take(tournamentId: number, { takeId }: { takeId: number }) {
	return broadcast(
		{ _action: "TAKE", takeId },
		{ user: organizerId(), params: params(tournamentId) },
	);
}

function params(tournamentId: number) {
	return {
		id: String(tournamentId),
		channel: CastChannel.list([castAccount])[0].slug,
	};
}

async function storedState(tournamentId: number) {
	const row = await BroadcastRepository.findByChannel({
		tournamentId,
		channel: castAccount,
	});

	return row!.state;
}
