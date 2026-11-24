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
import {
	BROADCAST_STATE_VERSION,
	DEFAULT_BROADCAST_SETTINGS,
} from "../broadcast-constants";
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

// right after the hub module started, which catches up on an automatic Take due as the server restarted
const serverStartedAt = Date.now();
const LONG_AFTER_SERVER_START_MS = 60 * 60_000;

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date"],
		now: serverStartedAt + LONG_AFTER_SERVER_START_MS,
	});
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
	test("greets the client with the version of the states it sends", () => {
		const client = connect({ build: buildOf(snapshot()) });

		expect(client.hello()).toMatchObject({ v: BROADCAST_STATE_VERSION });
	});

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

	test("tells the client the broadcast it is connected to", () => {
		const client = connect({});

		expect(client.hellos()).toEqual([KEY]);
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
			staleAt: Date.now() + 30_000,
		}));
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);
		build.mockClear();

		await vi.advanceTimersByTimeAsync(29_999);
		expect(build).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(build).toHaveBeenCalledOnce();
	});
});

describe("BroadcastHub gone broadcast", () => {
	test("blanks the clients once the broadcast builds to nothing, e.g. its channel was removed", async () => {
		const build = buildOf(snapshot());
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		build.mockResolvedValue(null);
		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);

		expect(client.gones()).toBe(1);
	});

	test("sends the state again once the broadcast is back", async () => {
		const build = buildOf(snapshot());
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);
		build.mockResolvedValueOnce(null);
		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);

		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);

		expect(client.states()).toHaveLength(2);
	});

	test("doesn't blank clients that never got a state", async () => {
		const client = connect({});
		await vi.advanceTimersByTimeAsync(0);

		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);

		expect(client.gones()).toBe(0);
	});
});

describe("BroadcastHub build retry", () => {
	test("retries a failing first build, waiting twice as long each time up to 10 seconds", async () => {
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
		expect(await callsAfter(9_999)).toBe(5);
		expect(await callsAfter(1)).toBe(6);
		expect(await callsAfter(10_000)).toBe(7);
	});

	test("stops retrying once a build succeeds", async () => {
		const build = buildOf(snapshot());
		build.mockRejectedValueOnce(new Error("Build failed"));
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(client.states()).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(build).toHaveBeenCalledTimes(2);
	});

	test("retries a failing rebuild and publishes once it succeeds, the clients keeping the last state meanwhile", async () => {
		const build = buildOf(snapshot());
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		const taken = snapshot({ ...Producer.initialState(rules), takeId: 1 });
		build.mockRejectedValueOnce(new Error("Build failed"));
		build.mockResolvedValue(built(taken));
		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);
		expect(client.states()).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(client.states().map((state) => state.takeId)).toEqual([0, 1]);
	});

	test("a client connecting after a failed rebuild gets the state once the retry succeeds", async () => {
		const build = buildOf(snapshot());
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		build.mockRejectedValueOnce(new Error("Build failed"));
		build.mockResolvedValue(
			built(snapshot({ ...Producer.initialState(rules), takeId: 1 })),
		);
		BroadcastHub.refresh(KEY);
		await vi.advanceTimersByTimeAsync(0);
		const late = connect({ build });
		await vi.advanceTimersByTimeAsync(1_000);

		expect(late.states().at(-1)?.takeId).toBe(1);
	});
});

describe("BroadcastHub safety rebuild", () => {
	test("rebuilds every 45 seconds while it has clients, healing a state that missed its event", async () => {
		const build = buildOf(snapshot());
		const client = connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		build.mockResolvedValue(
			built(snapshot({ ...Producer.initialState(rules), takeId: 1 })),
		);
		await vi.advanceTimersByTimeAsync(44_999);
		expect(client.states()).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(client.states().at(-1)?.takeId).toBe(1);
	});

	test("stops once the last client leaves", async () => {
		const build = buildOf(snapshot());
		connect({ build });
		await vi.advanceTimersByTimeAsync(0);

		for (const connection of connections) {
			connection.abort();
		}
		await vi.advanceTimersByTimeAsync(5 * 60_000);

		expect(build).toHaveBeenCalledOnce();
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

	test("doesn't take next for a client connecting long after the live scene ran out", async () => {
		const key = await createBroadcast();
		await takeTimed(key);
		await vi.advanceTimersByTimeAsync(60_000);

		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(1_000);

		expect((await storedState(key)).live.scene).toBe("casters");
	});

	test("doesn't take an item that can go on air by itself only after the live scene ran out", async () => {
		const key = await createBroadcast();
		await takeTimed(key);
		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "take",
		});
		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(30_000);

		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "timer",
		});
		BroadcastHub.refresh(key);
		await vi.advanceTimersByTimeAsync(1_000);

		expect((await storedState(key)).live.scene).toBe("casters");
	});

	test("still takes an item resumed within seconds of the live scene running out", async () => {
		const key = await createBroadcast();
		await takeTimed(key);
		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "take",
		});
		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(12_000);

		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "timer",
		});
		BroadcastHub.refresh(key);
		await vi.advanceTimersByTimeAsync(0);

		expect((await storedState(key)).live.scene).toBe("starting");
	});

	test("catches up on a Take that came due as the server restarted", async () => {
		vi.setSystemTime(serverStartedAt - 20_000);
		const key = await createBroadcast();
		await takeTimed(key);
		vi.setSystemTime(serverStartedAt + 30_000);

		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(0);

		const state = await storedState(key);
		expect(state.live.scene).toBe("starting");
		expect(state.takenBy).toBe("timer");
	});

	test.each([
		{
			why: "came due after the server started, nobody connected",
			takenAt: serverStartedAt,
			connectedAt: serverStartedAt + 90_000,
		},
		{
			why: "came due long before the server stopped",
			takenAt: serverStartedAt - 3 * 60_000,
			connectedAt: serverStartedAt + 5_000,
		},
	])(
		"doesn't catch up on a Take that $why",
		async ({ takenAt, connectedAt }) => {
			vi.setSystemTime(takenAt);
			const key = await createBroadcast();
			await takeTimed(key);
			vi.setSystemTime(connectedAt);

			connect({ ...key, build: storedBuild(key) });
			await vi.advanceTimersByTimeAsync(1_000);

			expect((await storedState(key)).live.scene).toBe("casters");
		},
	);

	test("catches up only on the first schedule after the server started, even one with nothing to time", async () => {
		vi.setSystemTime(serverStartedAt - 20_000);
		const key = await createBroadcast();
		await takeTimed(key);
		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "take",
		});
		vi.setSystemTime(serverStartedAt + 5_000);
		connect({ ...key, build: storedBuild(key) });
		await vi.advanceTimersByTimeAsync(30_000);

		await TournamentBroadcastFactory.setNextAdvance({
			...key,
			channel,
			advance: "timer",
		});
		BroadcastHub.refresh(key);
		await vi.advanceTimersByTimeAsync(1_000);

		expect((await storedState(key)).live.scene).toBe("casters");
	});

	test("takes once when a rebuild lands as the timer fires", async () => {
		const key = await createBroadcast();
		await takeTimed(key);
		connect({ ...key, build: storedBuild(key) });

		await vi.advanceTimersByTimeAsync(9_999);
		BroadcastHub.refresh(key);
		await vi.advanceTimersByTimeAsync(1);
		BroadcastHub.refresh(key);
		await vi.advanceTimersByTimeAsync(1_000);

		const state = await storedState(key);
		expect(state.takeId).toBe(2);
		expect(state.live.scene).toBe("starting");
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

describe("BroadcastHub.connectStandby", () => {
	test("tells the page its OBS URL shows no broadcast", () => {
		const standby = connectStandby(1);

		expect(standby.hellos()).toEqual([null]);
	});
});

describe("BroadcastHub.reconnectProgram", () => {
	const OTHER_KEY = { tournamentId: 2, slug: "other" };

	test("reconnects the pages of the OBS URL showing another broadcast or none", () => {
		const elsewhere = connect({ ...OTHER_KEY, programId: 1 });
		const standby = connectStandby(1);

		BroadcastHub.reconnectProgram({ programId: 1, except: KEY });

		expect(elsewhere.reconnects()).toBe(1);
		expect(standby.reconnects()).toBe(1);
	});

	test("leaves pages already showing the broadcast, producers' and other OBS URLs' pages as they are", () => {
		const showing = connect({ programId: 1 });
		const producer = connect({ ...OTHER_KEY, programId: null });
		const otherUser = connect({ ...OTHER_KEY, programId: 2 });

		BroadcastHub.reconnectProgram({ programId: 1, except: KEY });

		expect(showing.reconnects()).toBe(0);
		expect(producer.reconnects()).toBe(0);
		expect(otherUser.reconnects()).toBe(0);
	});
});

describe("BroadcastHub.sendObsAudio", () => {
	const OBS_AUDIO = { inputName: "Capture", port: 4455, password: null };

	test("tells the pages of the OBS URL how to mute the capture card, also one showing no broadcast yet", () => {
		const showing = connect({ programId: 1 });
		const standby = connectStandby(1);

		BroadcastHub.sendObsAudio({ programId: 1, obsAudio: OBS_AUDIO });

		expect(showing.obsAudios()).toEqual([OBS_AUDIO]);
		expect(standby.obsAudios()).toEqual([OBS_AUDIO]);
	});

	test("leaves out other OBS URLs' pages", () => {
		const otherUser = connect({ programId: 2 });

		BroadcastHub.sendObsAudio({ programId: 1, obsAudio: OBS_AUDIO });

		expect(otherUser.obsAudios()).toEqual([]);
	});
});

describe("BroadcastHub.closeProgram", () => {
	test("blanks and closes the connections through the OBS URL", () => {
		const showing = connect({ programId: 1 });
		const standby = connectStandby(1);

		BroadcastHub.closeProgram(1);

		expect(showing.gones()).toBe(1);
		expect(showing.close).toHaveBeenCalledOnce();
		expect(standby.gones()).toBe(1);
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
	const messages: BroadcastStreamMessage<TestState>[] = [];
	BroadcastHub.connectStandby({
		programId,
		send: (message) => messages.push(JSON.parse(message)),
		close,
		signal: connection.signal,
	});

	return { close, ...messagesOf(messages) };
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

	return { close, ...messagesOf(messages) };
}

function messagesOf(messages: BroadcastStreamMessage<TestState>[]) {
	const countOf = (kind: BroadcastStreamMessage["kind"]) =>
		messages.filter((message) => message.kind === kind).length;

	return {
		states: () =>
			messages.flatMap((message) =>
				message.kind === "state" ? [message.state] : [],
			),
		hello: () => messages.find((message) => message.kind === "hello"),
		hellos: () =>
			messages.flatMap((message) =>
				message.kind === "hello" ? [message.broadcast] : [],
			),
		reconnects: () => countOf("reconnect"),
		gones: () => countOf("gone"),
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
		tournament: { name: "Tournament", logoUrl: "", organizationName: null },
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
	return vi.fn<BroadcastHub.Layout<TestState>["build"]>(async () =>
		built(state),
	);
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

/** Puts casters on air for 10 seconds, starting soon staged to follow it by itself. */
function takeTimed(key: { tournamentId: number }) {
	return TournamentBroadcastFactory.take({
		...key,
		channel,
		next: { scene: "casters", durationMs: 10_000, transition: "cut" },
	});
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
