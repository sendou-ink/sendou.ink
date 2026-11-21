import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import type { CastProducerState } from "~/features/broadcast-cast/broadcast-cast-types";
import * as EventBus from "~/features/events/core/EventBus.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { logger } from "~/utils/logger";
import * as BroadcastRepository from "../BroadcastRepository.server";
import { DEFAULT_BROADCAST_SETTINGS } from "../broadcast-constants";
import type {
	BroadcastChannel,
	BroadcastState,
	BroadcastStoredState,
	BroadcastStreamMessage,
} from "../broadcast-types";
import * as BroadcastHub from "./BroadcastHub.server";
import * as BroadcastSnapshot from "./BroadcastSnapshot.server";
import * as Producer from "./Producer";

type TestState = BroadcastState<CastProducerState>;

const rules = CAST_PRODUCER_RULES;

const KEY = { tournamentId: 1, slug: "sendouink" };

const channel: BroadcastChannel = {
	platform: "TWITCH",
	account: "sendouink",
	name: "sendouink",
	slug: "sendouink",
};

const users = UserFactory.pool();

const connections: AbortController[] = [];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	vi.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => {
	for (const connection of connections) {
		connection.abort();
	}
	connections.length = 0;
	vi.useRealTimers();
});

describe("BroadcastHub.connect", () => {
	test("sends the built state to the client", async () => {
		const client = connect({ build: buildOf(snapshot()) });

		await vi.advanceTimersByTimeAsync(0);

		expect(client.states()).toHaveLength(1);
		expect(client.states()[0].health).toEqual({ sources: 1, scanners: 0 });
	});

	test("rebuilds once for a burst of tournament events", async () => {
		const build = buildOf(snapshot());
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);
		build.mockClear();

		for (let i = 0; i < 3; i++) {
			EventBus.publish([tournamentChannel(KEY.tournamentId)], {
				kind: "revalidate",
			});
		}
		await vi.advanceTimersByTimeAsync(249);
		expect(build).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(build).toHaveBeenCalledOnce();
	});

	test("builds once more after a build that changes came in during", async () => {
		const firstBuild =
			Promise.withResolvers<BroadcastSnapshot.Built<TestState>>();
		const build = buildOf(snapshot());
		build.mockReturnValueOnce(firstBuild.promise);
		connect({ build });

		for (let i = 0; i < 3; i++) {
			BroadcastHub.refresh(KEY);
		}
		firstBuild.resolve(built(snapshot()));
		await vi.advanceTimersByTimeAsync(0);

		expect(build).toHaveBeenCalledTimes(2);
	});

	test("doesn't resend a state the clients already have", async () => {
		const client = connect({ build: buildOf(snapshot()) });
		await vi.advanceTimersByTimeAsync(0);

		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);

		expect(client.states()).toHaveLength(1);
	});
});

describe("BroadcastHub stale rebuild", () => {
	test("rebuilds when the built state goes stale by itself", async () => {
		const build = vi.fn(async () => ({
			...built(snapshot()),
			staleAt: Date.now() + 60_000,
		}));
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);
		build.mockClear();

		await vi.advanceTimersByTimeAsync(59_999);
		expect(build).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(build).toHaveBeenCalledOnce();
	});
});

describe("BroadcastHub first build retry", () => {
	test("retries a failing first build, waiting twice as long each time up to 30 seconds", async () => {
		const build = vi.fn(() =>
			Promise.reject<BroadcastSnapshot.Built<TestState>>(
				new Error("Build failed"),
			),
		);
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		const callsAfter = async (ms: number) => {
			await vi.advanceTimersByTimeAsync(ms);
			return build.mock.calls.length;
		};

		expect(build).toHaveBeenCalledOnce();
		expect(await callsAfter(1_000)).toBe(2);
		expect(await callsAfter(2_000)).toBe(3);
		expect(await callsAfter(4_000)).toBe(4);
		expect(await callsAfter(8_000)).toBe(5);
		expect(await callsAfter(16_000)).toBe(6);
		expect(await callsAfter(29_999)).toBe(6);
		expect(await callsAfter(1)).toBe(7);
		expect(await callsAfter(30_000)).toBe(8);
	});

	test("stops retrying once a build succeeds", async () => {
		const build = buildOf(snapshot());
		build.mockRejectedValueOnce(new Error("Build failed"));
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(client.states()).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(build).toHaveBeenCalledTimes(2);
	});

	test("doesn't retry a failing rebuild while there is a state to show", async () => {
		const build = buildOf(snapshot());
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		build.mockRejectedValue(new Error("Build failed"));
		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(build).toHaveBeenCalledTimes(2);
		expect(client.states()).toHaveLength(1);
	});
});

describe("BroadcastHub auto-Take", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("takes the staged scene once the live scene has run its length", async () => {
		const key = await createBroadcast();
		await TournamentBroadcastFactory.take({
			...key,
			channel,
			next: { scene: "casters", durationMs: 10_000, transition: "cut" },
		});
		const client = connect({ ...key, build: storedBuild(key) });

		await vi.advanceTimersByTimeAsync(9_999);
		expect((await storedState(key)).live.scene).toBe("casters");

		await vi.advanceTimersByTimeAsync(1);
		const state = await storedState(key);
		expect(state.live.scene).toBe("starting");
		expect(state.takeId).toBe(2);
		expect(client.states().at(-1)?.live.scene).toBe("starting");
	});

	test("skips the timed Take when another Take came first", async () => {
		const key = await createBroadcast();
		await TournamentBroadcastFactory.take({
			...key,
			channel,
			next: { scene: "casters", durationMs: 10_000, transition: "cut" },
		});
		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(0);

		await TournamentBroadcastFactory.take({
			...key,
			channel,
			next: { scene: "break", durationMs: null },
		});
		await vi.advanceTimersByTimeAsync(10_000);

		const state = await storedState(key);
		expect(state.live.scene).toBe("break");
		expect(state.takeId).toBe(2);
	});

	test("cuts to the game as the scanner sees it start", async () => {
		const key = await createBroadcast();
		const build = storedBuild(key);
		connect({ ...key, build });
		await vi.advanceTimersByTimeAsync(0);

		await BroadcastHub.applyGameSignal({
			...key,
			layout: { producer: rules, build },
			signal: { type: "start", inks: null },
		});

		expect((await storedState(key)).live.scene).toBe("game");
	});
});

describe("BroadcastHub.reloadProgram", () => {
	const OTHER_KEY = { tournamentId: 2, slug: "other" };

	test("reloads the pages of the OBS URL showing another broadcast or none", () => {
		const elsewhere = connect({ ...OTHER_KEY, programId: 1 });
		const standby = connectStandby(1);

		BroadcastHub.reloadProgram({ programId: 1, except: KEY });

		expect(elsewhere.reloads()).toBe(1);
		expect(standby.reloads()).toBe(1);
	});

	test("leaves pages already showing the broadcast, producers' and other OBS URLs' pages as they are", () => {
		const showing = connect({ programId: 1 });
		const producer = connect({ ...OTHER_KEY, programId: null });
		const otherUser = connect({ ...OTHER_KEY, programId: 2 });

		BroadcastHub.reloadProgram({ programId: 1, except: KEY });

		expect(showing.reloads()).toBe(0);
		expect(producer.reloads()).toBe(0);
		expect(otherUser.reloads()).toBe(0);
	});
});

describe("BroadcastHub.sendObsAudio", () => {
	const OBS_AUDIO = { inputName: "Capture", port: 4455, password: null };

	test("tells the overlays of the OBS URL how to mute the capture card", () => {
		const showing = connect({ programId: 1 });

		BroadcastHub.sendObsAudio({ programId: 1, obsAudio: OBS_AUDIO });

		expect(showing.obsAudios()).toEqual([OBS_AUDIO]);
	});

	test("leaves out other OBS URLs' pages and a page showing no broadcast, which would load again", () => {
		const otherUser = connect({ programId: 2 });
		const standby = connectStandby(1);

		BroadcastHub.sendObsAudio({ programId: 1, obsAudio: OBS_AUDIO });

		expect(otherUser.obsAudios()).toEqual([]);
		expect(standby.obsAudios()).toBe(0);
	});
});

describe("BroadcastHub.closeProgram", () => {
	test("closes the connections through the OBS URL", () => {
		const showing = connect({ programId: 1 });
		const standby = connectStandby(1);

		BroadcastHub.closeProgram(1);

		expect(showing.close).toHaveBeenCalledOnce();
		expect(standby.close).toHaveBeenCalledOnce();
	});

	test.each([
		{ why: "a producer's", programId: null },
		{ why: "another OBS URL's", programId: 2 },
	])("keeps $why connections", ({ programId }) => {
		const { close } = connect({ programId });

		BroadcastHub.closeProgram(1);

		expect(close).not.toHaveBeenCalled();
	});
});

function connectStandby(programId: number) {
	const connection = new AbortController();
	connections.push(connection);
	const close = vi.fn();
	const messages: BroadcastStreamMessage[] = [];
	BroadcastHub.connectStandby({
		programId,
		send: (message) => messages.push(JSON.parse(message)),
		close,
		signal: connection.signal,
	});

	return {
		close,
		reloads: () =>
			messages.filter((message) => message.kind === "reload").length,
		obsAudios: () =>
			messages.filter((message) => message.kind === "obsAudio").length,
	};
}

function connect({
	build = async () => null,
	programId = null,
	...key
}: {
	build?: BroadcastHub.Layout<TestState>["build"];
	programId?: number | null;
	tournamentId?: number;
	slug?: string;
}) {
	const connection = new AbortController();
	connections.push(connection);
	const close = vi.fn();
	const messages: BroadcastStreamMessage<TestState>[] = [];
	BroadcastHub.connect({
		...KEY,
		...key,
		layout: { producer: rules, build },
		role: "source",
		send: (message) => messages.push(JSON.parse(message)),
		close,
		signal: connection.signal,
		isClipSender: false,
		programId,
	});

	return {
		close,
		states: () =>
			messages.flatMap((message) =>
				message.kind === "state" ? [message.state] : [],
			),
		reloads: () =>
			messages.filter((message) => message.kind === "reload").length,
		obsAudios: () =>
			messages.flatMap((message) =>
				message.kind === "obsAudio" ? [message.obsAudio] : [],
			),
	};
}

function snapshot(
	state: BroadcastStoredState<CastProducerState> = Producer.initialState(rules),
	settings: Partial<TestState["settings"]> = {},
): BroadcastSnapshot.Snapshot<TestState> {
	return {
		...state,
		v: 1,
		settings: { ...DEFAULT_BROADCAST_SETTINGS, ...settings },
		tournament: { name: "Tournament", logoUrl: "" },
		match: null,
	};
}

function built(
	state: BroadcastSnapshot.Snapshot<TestState>,
	tournamentId = KEY.tournamentId,
): BroadcastSnapshot.Built<TestState> {
	return {
		snapshot: state,
		channel,
		eventChannels: [tournamentChannel(tournamentId)],
		staleAt: null,
	};
}

function buildOf(state: BroadcastSnapshot.Snapshot<TestState>) {
	return vi.fn(async () => built(state));
}

/** Builds the broadcast as stored like a scene set's layout does. */
function storedBuild({ tournamentId }: { tournamentId: number }) {
	return async () => {
		const stored = await BroadcastSnapshot.stored({
			tournamentId,
			channel,
			rules,
			defaultSettings: DEFAULT_BROADCAST_SETTINGS,
		});

		return built(snapshot(stored.state, stored.settings), tournamentId);
	};
}

async function createBroadcast() {
	const { id: tournamentId } = await TournamentFactory.create({
		authorId: users.id(1),
	});

	return { tournamentId, slug: channel.slug };
}

async function storedState({ tournamentId }: { tournamentId: number }) {
	const broadcast = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});

	return Producer.withDefaults(rules, broadcast!.state);
}
