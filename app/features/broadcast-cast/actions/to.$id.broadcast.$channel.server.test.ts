import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { broadcastActionSchema } from "../broadcast-cast-schemas";
import type { CastBroadcastSettings } from "../broadcast-cast-types";
import * as CastChannel from "../core/CastChannel";
import { action as broadcastAction } from "./to.$id.broadcast.$channel.server";

const broadcast = wrappedAction<typeof broadcastActionSchema>({
	action: broadcastAction,
});
const broadcastForm = wrappedAction<typeof broadcastActionSchema>({
	action: broadcastAction,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const casterId = () => users.id(2);
const otherCasterId = () => users.id(3);

const castAccount = {
	platform: "TWITCH" as const,
	account: "sendouink",
	name: "sendouink",
};

const originalBroadcastOrgIds = ServerConfig.broadcastOrgIds;

beforeEach(async () => {
	ServerConfig.broadcastOrgIds = "*";
	await users.create(3);
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

describe("UPDATE_CASTERS", () => {
	test("saves the casters with their VDO.ninja links, at full volume", async () => {
		const tournamentId = await createTournament();

		await updateCasters(tournamentId, [
			{
				userId: casterId(),
				vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
				isAudioOnly: true,
			},
			{ userId: otherCasterId(), vdoNinjaUrl: null },
		]);

		expect((await storedSettings(tournamentId))?.casters).toEqual([
			{
				userId: casterId(),
				vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
				isAudioOnly: true,
				volume: 100,
			},
			{
				userId: otherCasterId(),
				vdoNinjaUrl: null,
				isAudioOnly: false,
				volume: 100,
			},
		]);
	});

	test("keeps the volume of a caster saved again", async () => {
		const tournamentId = await createTournament();
		await updateCasters(tournamentId, [
			{ userId: casterId(), vdoNinjaUrl: "https://vdo.ninja/?view=abc123" },
		]);
		await setCasterVolume(tournamentId, { userId: casterId(), volume: 40 });

		await updateCasters(tournamentId, [
			{ userId: otherCasterId(), vdoNinjaUrl: null },
			{ userId: casterId(), vdoNinjaUrl: "https://vdo.ninja/?view=xyz" },
		]);

		expect((await storedSettings(tournamentId))?.casters).toEqual([
			{
				userId: otherCasterId(),
				vdoNinjaUrl: null,
				isAudioOnly: false,
				volume: 100,
			},
			{
				userId: casterId(),
				vdoNinjaUrl: "https://vdo.ninja/?view=xyz",
				isAudioOnly: false,
				volume: 40,
			},
		]);
	});

	test("rejects a link that isn't a VDO.ninja view link", async () => {
		const tournamentId = await createTournament();

		const response = await updateCasters(tournamentId, [
			{ userId: casterId(), vdoNinjaUrl: "https://vdo.ninja/?push=abc123" },
		]);

		expect(response).toHaveProperty("fieldErrors");
		expect((await storedSettings(tournamentId))?.casters).toBeUndefined();
	});
});

describe("SET_CASTER_VOLUME", () => {
	test("changes only the caster's volume", async () => {
		const tournamentId = await createTournament();
		await updateCasters(tournamentId, [
			{ userId: casterId(), vdoNinjaUrl: "https://vdo.ninja/?view=abc123" },
			{ userId: otherCasterId(), vdoNinjaUrl: "https://vdo.ninja/?view=xyz" },
		]);

		await setCasterVolume(tournamentId, { userId: otherCasterId(), volume: 0 });

		expect(
			(await storedSettings(tournamentId))?.casters.map(
				(caster) => caster.volume,
			),
		).toEqual([100, 0]);
	});

	test("rejects the volume of a caster not on the broadcast", async () => {
		const tournamentId = await createTournament();

		const response = await setCasterVolume(tournamentId, {
			userId: casterId(),
			volume: 50,
		});

		assertResponseErrored(response, "isn't on the broadcast anymore");
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

function updateCasters(
	tournamentId: number,
	casters: Array<{
		userId: number;
		vdoNinjaUrl: string | null;
		isAudioOnly?: boolean;
	}>,
) {
	return broadcastForm(
		{
			_action: "UPDATE_CASTERS",
			casters: casters.map((caster) => ({
				isAudioOnly: false,
				...caster,
			})),
		},
		{ user: organizerId(), params: params(tournamentId) },
	);
}

function setCasterVolume(
	tournamentId: number,
	{ userId, volume }: { userId: number; volume: number },
) {
	return broadcast(
		{ _action: "SET_CASTER_VOLUME", userId, volume },
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

async function storedSettings(tournamentId: number) {
	const row = await BroadcastRepository.findByChannel({
		tournamentId,
		channel: castAccount,
	});

	return row?.settings as CastBroadcastSettings | undefined;
}
