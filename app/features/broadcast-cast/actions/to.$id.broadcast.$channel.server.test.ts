import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import type { BroadcastMusicTrack } from "~/features/broadcast/broadcast-types";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import * as MusicPlayback from "~/features/broadcast/core/MusicPlayback";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { broadcastActionSchema } from "../broadcast-cast-schemas";
import type {
	BroadcastClip,
	CastBroadcastSettings,
	CastProducerState,
} from "../broadcast-cast-types";
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

const tracks: BroadcastMusicTrack[] = [
	{
		id: "a".repeat(32),
		durationMs: 60_000,
		title: "First",
		artist: "Band",
	},
	{
		id: "b".repeat(32),
		durationMs: 90_000,
		title: "Second",
		artist: null,
	},
];

const STARTED_AT = new Date("2026-11-21T12:00:00Z").getTime();

type ActionBody = Parameters<typeof broadcast>[0];

/**
 * A valid body of each action, every one of them, `stale` the same based on a staged item gone on air (the first Take
 * puts item 2 on air) or a Take no longer the latest. Submitted as SendouForm does when `isForm`.
 */
const EVERY_ACTION: {
	[Name in ActionBody["_action"]]: {
		body: Extract<ActionBody, { _action: Name }>;
		stale?: Extract<ActionBody, { _action: Name }>;
		isForm?: boolean;
	};
} = {
	SET_SCENE: {
		body: { _action: "SET_SCENE", itemId: 2, scene: "bracket" },
		stale: { _action: "SET_SCENE", itemId: 2, scene: "bracket" },
	},
	SET_TRANSITION: {
		body: { _action: "SET_TRANSITION", itemId: 2, transition: "cut" },
		stale: { _action: "SET_TRANSITION", itemId: 2, transition: "cut" },
	},
	SET_INK: {
		body: {
			_action: "SET_INK",
			key: "greenPink",
			matchId: 1,
			resultCount: 0,
		},
	},
	SET_SWAP_SIDES: { body: { _action: "SET_SWAP_SIDES", swapSides: true } },
	SET_BRACKET: {
		body: { _action: "SET_BRACKET", itemId: 2, bracketIdx: 0 },
		stale: { _action: "SET_BRACKET", itemId: 2, bracketIdx: 0 },
	},
	SET_BRACKET_SIDE: {
		body: {
			_action: "SET_BRACKET_SIDE",
			itemId: 2,
			side: "winners",
			focus: "hidden",
		},
		stale: {
			_action: "SET_BRACKET_SIDE",
			itemId: 2,
			side: "winners",
			focus: "hidden",
		},
	},
	SET_TEAM: {
		body: { _action: "SET_TEAM", itemId: 2, teamPick: "right" },
		stale: { _action: "SET_TEAM", itemId: 2, teamPick: "right" },
	},
	SET_CLIP: {
		body: { _action: "SET_CLIP", itemId: 2 },
		stale: { _action: "SET_CLIP", itemId: 2 },
	},
	SET_DURATION: {
		body: { _action: "SET_DURATION", itemId: 2 },
		stale: { _action: "SET_DURATION", itemId: 2 },
	},
	SET_ADVANCE: {
		body: { _action: "SET_ADVANCE", itemId: 2, advance: "take" },
		stale: { _action: "SET_ADVANCE", itemId: 2, advance: "take" },
	},
	SET_CASTER_VOLUME: {
		body: { _action: "SET_CASTER_VOLUME", userId: 1, volume: 50 },
	},
	PLAY_MUSIC: { body: { _action: "PLAY_MUSIC", tracks }, isForm: true },
	SET_MUSIC_TRACKS: {
		body: { _action: "SET_MUSIC_TRACKS", tracks },
		isForm: true,
	},
	PAUSE_MUSIC: { body: { _action: "PAUSE_MUSIC" }, isForm: true },
	STOP_MUSIC: { body: { _action: "STOP_MUSIC" }, isForm: true },
	SKIP_MUSIC: {
		body: { _action: "SKIP_MUSIC", direction: "next", trackId: tracks[0]!.id },
		isForm: true,
	},
	SET_MUSIC_VOLUME: {
		body: { _action: "SET_MUSIC_VOLUME", volume: 20 },
		isForm: true,
	},
	SET_MUSIC_SHUFFLE: {
		body: { _action: "SET_MUSIC_SHUFFLE", isShuffled: true },
	},
	ADD_TO_QUEUE: { body: { _action: "ADD_TO_QUEUE" } },
	POINT_PROGRAM: { body: { _action: "POINT_PROGRAM" } },
	REGENERATE_PROGRAM_KEY: { body: { _action: "REGENERATE_PROGRAM_KEY" } },
	REMOVE_FROM_QUEUE: {
		body: { _action: "REMOVE_FROM_QUEUE", itemId: 2 },
		stale: { _action: "REMOVE_FROM_QUEUE", itemId: 2 },
	},
	MOVE_IN_QUEUE: {
		body: { _action: "MOVE_IN_QUEUE", itemId: 2, toIndex: 0 },
		stale: { _action: "MOVE_IN_QUEUE", itemId: 2, toIndex: 0 },
	},
	TAKE: {
		body: { _action: "TAKE", takeId: 0 },
		stale: { _action: "TAKE", takeId: 0 },
	},

	SHOW_RESULTS: {
		body: { _action: "SHOW_RESULTS", matchId: 1, resultCount: 0 },
	},
	UPDATE_THEME: {
		body: { _action: "UPDATE_THEME", weaponImages: "default" },
		isForm: true,
	},
	UPDATE_NOW_PLAYING: {
		body: { _action: "UPDATE_NOW_PLAYING", nowPlaying: "Lofi Squid Beats" },
		isForm: true,
	},
	UPDATE_HEADLINE: {
		body: { _action: "UPDATE_HEADLINE", headline: "Top 8" },
		isForm: true,
	},
	UPDATE_CASTERS: {
		body: { _action: "UPDATE_CASTERS", casters: [] },
		isForm: true,
	},
	UPDATE_OBS_AUDIO: {
		body: {
			_action: "UPDATE_OBS_AUDIO",
			port: 4455,
			password: null,
			inputName: null,
		},
		isForm: true,
	},
};

beforeEach(async () => {
	await users.create(3);
});

afterEach(() => {
	vi.restoreAllMocks();
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

		assertResponseErrored(response, "Next already went on air");
		const state = await storedState(tournamentId);
		expect(state.takeId).toBe(1);
		expect(state.live.scene).toBe("game");
	});

	test("rejects a Take right after Next went on air by itself", async () => {
		const tournamentId = await createTournament();
		await autoTake(tournamentId);

		const response = await take(tournamentId, { takeId: 1 });

		assertResponseErrored(response, "Next just went on air by itself");
		expect((await storedState(tournamentId)).takeId).toBe(1);
	});

	test("takes once the moment after an automatic Take has passed", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const tournamentId = await createTournament();
			await autoTake(tournamentId);
			vi.setSystemTime(Date.now() + 1_500);

			const response = await take(tournamentId, { takeId: 1 });

			expect(response).toBeNull();
			expect((await storedState(tournamentId)).takeId).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	test("rejects a Take right after the producer's own, e.g. a held key repeating it", async () => {
		const tournamentId = await createTournament();
		await take(tournamentId, { takeId: 0 });

		const response = await take(tournamentId, { takeId: 1 });

		assertResponseErrored(response, "Next was just taken");
		expect((await storedState(tournamentId)).takeId).toBe(1);
	});

	test("a rejected Take rebuilds what is on air, in case a rebuild missed the last Take", async () => {
		const tournamentId = await createTournament();
		await take(tournamentId, { takeId: 0 });
		const refresh = vi.spyOn(BroadcastHub, "refresh");

		await take(tournamentId, { takeId: 0 });

		expect(refresh).toHaveBeenCalledWith({
			tournamentId,
			slug: castAccount.account,
		});
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

	function autoTake(tournamentId: number) {
		return TournamentBroadcastFactory.take({
			tournamentId,
			channel: castAccount,
			next: {},
			by: "timer",
		});
	}
});

describe("every action", () => {
	test.each(Object.entries(EVERY_ACTION))(
		"%s is only for the broadcast's producers",
		async (_name, { body, isForm }) => {
			const tournamentId = await createTournament();
			const submit = isForm ? broadcastForm : broadcast;

			await expect(
				submit(body, { user: casterId(), params: params(tournamentId) }),
			).rejects.toThrow("404");
		},
	);

	test.each(
		Object.entries(EVERY_ACTION).filter(([, { stale }]) => stale !== undefined),
	)(
		"%s is refused for a staged item or Take that's not current anymore",
		async (_name, { stale }) => {
			const tournamentId = await createTournament();
			await take(tournamentId, { takeId: 0 });
			const before = await storedState(tournamentId);

			const response = await broadcast(stale!, {
				user: organizerId(),
				params: params(tournamentId),
			});

			assertResponseErrored(response);
			expect(await storedState(tournamentId)).toEqual(before);
		},
	);
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

describe("SET_CLIP", () => {
	const clip = {
		id: "7-1790000000000",
		durationMs: 25_000,
		kills: 3,
		moments: ["splats", "lead"],
	} as const;

	test("stages the clip, which times the replays scene", async () => {
		const tournamentId = await createTournament();
		await setReplays(tournamentId);

		await setClip(tournamentId, JSON.stringify(clip));

		expect(await stagedClip(tournamentId)).toEqual(clip);
	});

	test("goes back to the OBS footage without a clip", async () => {
		const tournamentId = await createTournament();
		await setReplays(tournamentId);
		await setClip(tournamentId, JSON.stringify(clip));

		await setClip(tournamentId, undefined);

		expect(await stagedClip(tournamentId)).toBeNull();
	});

	test("rejects a clip that isn't what the scanner cuts", async () => {
		const tournamentId = await createTournament();
		await setReplays(tournamentId);

		const response = await setClip(
			tournamentId,
			JSON.stringify({ ...clip, moments: ["ace"] }),
		);

		assertResponseErrored(response);
		expect(await stagedClip(tournamentId)).toBeNull();
	});

	function setReplays(tournamentId: number) {
		return broadcast(
			{ _action: "SET_SCENE", itemId: 2, scene: "replays" },
			{ user: organizerId(), params: params(tournamentId) },
		);
	}

	function setClip(tournamentId: number, serializedClip: string | undefined) {
		return broadcast(
			{
				_action: "SET_CLIP",
				itemId: 2,
				// the dashboard posts the clip as JSON
				...(serializedClip
					? { clip: serializedClip as unknown as BroadcastClip }
					: {}),
			},
			{ user: organizerId(), params: params(tournamentId) },
		);
	}

	async function stagedClip(tournamentId: number) {
		const { next } = await storedState(tournamentId);

		return (next as CastProducerState).clip;
	}
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

	test("a rejected volume rebuilds the broadcast, in case its casters are out of date", async () => {
		const tournamentId = await createTournament();
		const refresh = vi.spyOn(BroadcastHub, "refresh");

		await setCasterVolume(tournamentId, { userId: casterId(), volume: 50 });

		expect(refresh).toHaveBeenCalledWith({
			tournamentId,
			slug: castAccount.account,
		});
	});
});

describe("a change to an item no longer staged", () => {
	test("is rejected and rebuilds the broadcast, in case its queue is out of date", async () => {
		const tournamentId = await createTournament();
		const refresh = vi.spyOn(BroadcastHub, "refresh");

		const response = await broadcast(
			{ _action: "SET_TRANSITION", itemId: 999, transition: "cut" },
			{ user: organizerId(), params: params(tournamentId) },
		);

		assertResponseErrored(response, "isn't staged anymore");
		expect(refresh).toHaveBeenCalledWith({
			tournamentId,
			slug: castAccount.account,
		});
	});
});

describe("UPDATE_OBS_AUDIO", () => {
	test("saves how to reach the capture card in OBS with the user's URL", async () => {
		const tournamentId = await createTournament();
		await generateUrl(tournamentId);

		await updateObsAudio(tournamentId, {
			inputName: "Capture Card",
			port: 4455,
			password: "hunter2",
		});

		expect(await storedObsAudio()).toEqual({
			inputName: "Capture Card",
			port: 4455,
			password: "hunter2",
		});
	});

	test("turns it off without a capture card name", async () => {
		const tournamentId = await createTournament();
		await generateUrl(tournamentId);
		await updateObsAudio(tournamentId, {
			inputName: "Capture Card",
			port: 4455,
			password: null,
		});

		await updateObsAudio(tournamentId, {
			inputName: null,
			port: 4455,
			password: null,
		});

		expect(await storedObsAudio()).toBeNull();
	});

	test("rejects a port out of range", async () => {
		const tournamentId = await createTournament();
		await generateUrl(tournamentId);

		const response = await updateObsAudio(tournamentId, {
			inputName: "Capture Card",
			port: 70_000,
			password: null,
		});

		expect(response).toHaveProperty("fieldErrors");
		expect(await storedObsAudio()).toBeNull();
	});

	test("rejects saving before the user generated their URL", async () => {
		const tournamentId = await createTournament();

		const response = await updateObsAudio(tournamentId, {
			inputName: "Capture Card",
			port: 4455,
			password: null,
		});

		assertResponseErrored(response, "Generate your browser source URL first");
	});
});

describe("UPDATE_NOW_PLAYING", () => {
	test("saves the now playing text", async () => {
		const tournamentId = await createTournament();

		await updateNowPlaying(tournamentId, "Lofi Squid Beats");

		expect((await storedSettings(tournamentId))?.nowPlaying).toBe(
			"Lofi Squid Beats",
		);
	});

	test("clears it without a text", async () => {
		const tournamentId = await createTournament();
		await updateNowPlaying(tournamentId, "Lofi Squid Beats");

		await updateNowPlaying(tournamentId, null);

		expect((await storedSettings(tournamentId))?.nowPlaying).toBe("");
	});
});

describe("music", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(STARTED_AT);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("plays the tracks from the start at the default volume", async () => {
		const tournamentId = await createTournament();

		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });

		expect((await storedState(tournamentId)).music).toEqual({
			tracks,
			startedAt: STARTED_AT,
			pausedAtMs: null,
			volume: 50,
			shuffleSeed: null,
		});
	});

	test("plays on from where it was paused", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });
		vi.setSystemTime(STARTED_AT + 10_000);
		await music(tournamentId, { _action: "PAUSE_MUSIC" });
		vi.setSystemTime(STARTED_AT + 50_000);

		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });

		expect((await storedState(tournamentId)).music).toMatchObject({
			startedAt: STARTED_AT + 40_000,
			pausedAtMs: null,
		});
	});

	test("skips to the next track", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });
		vi.setSystemTime(STARTED_AT + 10_000);

		await music(tournamentId, {
			_action: "SKIP_MUSIC",
			direction: "next",
			trackId: tracks[0].id,
		});

		expect((await storedState(tournamentId)).music).toMatchObject({
			startedAt: STARTED_AT + 10_000 - 60_000,
		});
	});

	test("a skip pressed on a track no longer playing changes nothing", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });
		vi.setSystemTime(STARTED_AT + 70_000);

		await music(tournamentId, {
			_action: "SKIP_MUSIC",
			direction: "next",
			trackId: tracks[0].id,
		});

		expect((await storedState(tournamentId)).music).toMatchObject({
			startedAt: STARTED_AT,
		});
	});

	test("sets the volume", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });

		await music(tournamentId, { _action: "SET_MUSIC_VOLUME", volume: 20 });

		expect((await storedState(tournamentId)).music).toMatchObject({
			volume: 20,
		});
	});

	test("shuffles the tracks, the track playing playing on", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });
		vi.setSystemTime(STARTED_AT + 70_000);

		await setShuffle(tournamentId, true);

		const shuffled = (await storedState(tournamentId)).music!;
		expect(shuffled.shuffleSeed).toEqual(expect.any(Number));
		expect(MusicPlayback.current(shuffled, STARTED_AT + 70_000)).toEqual(
			expect.objectContaining({ track: tracks[1], positionMs: 10_000 }),
		);
	});

	test("plays the tracks in order again with shuffle turned off", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });
		await setShuffle(tournamentId, true);

		await setShuffle(tournamentId, false);

		expect((await storedState(tournamentId)).music?.shuffleSeed).toBeNull();
	});

	test("stops", async () => {
		const tournamentId = await createTournament();
		await music(tournamentId, { _action: "PLAY_MUSIC", tracks });

		await music(tournamentId, { _action: "STOP_MUSIC" });

		expect((await storedState(tournamentId)).music).toBeNull();
	});

	test("changing the tracks of no music playing plays none", async () => {
		const tournamentId = await createTournament();

		await music(tournamentId, { _action: "SET_MUSIC_TRACKS", tracks });

		expect((await storedState(tournamentId)).music ?? null).toBeNull();
	});

	test("rejects a track id not of a file's contents", async () => {
		const tournamentId = await createTournament();

		const response = await music(tournamentId, {
			_action: "PLAY_MUSIC",
			tracks: [{ ...tracks[0], id: "../../etc" }],
		});

		expect(response).not.toBeNull();
		expect(
			await BroadcastRepository.findByChannel({
				tournamentId,
				channel: castAccount,
			}),
		).toBeUndefined();
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

function generateUrl(tournamentId: number) {
	return broadcast(
		{ _action: "POINT_PROGRAM" },
		{ user: organizerId(), params: params(tournamentId) },
	);
}

async function storedObsAudio() {
	return (await BroadcastRepository.findProgram(organizerId()))?.obsAudio;
}

function updateObsAudio(
	tournamentId: number,
	obsAudio: { inputName: string | null; port: number; password: string | null },
) {
	return broadcastForm(
		{ _action: "UPDATE_OBS_AUDIO", ...obsAudio },
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

function updateNowPlaying(tournamentId: number, nowPlaying: string | null) {
	return broadcastForm(
		{ _action: "UPDATE_NOW_PLAYING", nowPlaying },
		{ user: organizerId(), params: params(tournamentId) },
	);
}

function setShuffle(tournamentId: number, isShuffled: boolean) {
	return broadcast(
		{ _action: "SET_MUSIC_SHUFFLE", isShuffled },
		{ user: organizerId(), params: params(tournamentId) },
	);
}

function music(
	tournamentId: number,
	body: Parameters<typeof broadcastForm>[0],
) {
	return broadcastForm(body, {
		user: organizerId(),
		params: params(tournamentId),
	});
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
