import * as R from "remeda";
import * as EventBus from "~/features/events/core/EventBus.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { logger } from "~/utils/logger";
import * as BroadcastRepository from "../BroadcastRepository.server";
import { BROADCAST_MAX_CONNECTIONS } from "../broadcast-constants";
import type {
	BroadcastGameSignal,
	BroadcastHealth,
	BroadcastPeer,
	BroadcastSessionDescription,
	BroadcastState,
	BroadcastStreamMessage,
	BroadcastStreamRole,
} from "../broadcast-types";
import * as BroadcastSnapshot from "./BroadcastSnapshot.server";
import * as Producer from "./Producer";

// one event often comes with others (a report also ends the set and advances the bracket)
const REBUILD_DEBOUNCE_MS = 250;
// timers can fire a little early
const AUTO_TAKE_TOLERANCE_MS = 50;

interface HubKey {
	tournamentId: number;
	slug: string;
}

interface Client {
	role: BroadcastStreamRole;
	/** Gets a serialized {@link BroadcastStreamMessage}. */
	send: (message: string) => void;
	peerId: string;
	token: string;
	/** A producer's dashboard, which sends the overlays replay clips over WebRTC. Peers signal only to the other kind. */
	isClipSender: boolean;
}

interface Hub extends HubKey {
	clients: Set<Client>;
	snapshot: BroadcastSnapshot.Snapshot | null;
	lastSentMessage: string | null;
	eventChannels: string[];
	stop: AbortController;
	resubscribe: AbortController;
	rebuildTimer: ReturnType<typeof setTimeout> | null;
	/** Puts the staged item on air once the live scene has run its length, see `Producer.autoTakeAt`. */
	autoTakeTimer: ReturnType<typeof setTimeout> | null;
	isBuilding: boolean;
	isDirty: boolean;
}

declare global {
	var __broadcastHubs: Map<string, Hub> | undefined;
}

// on globalThis so the hubs of the code the dev server evaluated before this are found and retired: they keep
// running that code, its clients reconnect to hubs running this
globalThis.__broadcastHubs ??= new Map();
const hubs = globalThis.__broadcastHubs;
const RECONNECT_MESSAGE = JSON.stringify({
	kind: "reconnect",
} satisfies BroadcastStreamMessage);
for (const hub of hubs.values()) {
	hub.stop.abort();
	for (const client of hub.clients) {
		client.send(RECONNECT_MESSAGE);
	}
}
hubs.clear();

/**
 * Connects a client to the broadcast: it gets the current state right away (once built) and every change after,
 * until the signal aborts. One hub per broadcast rebuilds the state on the tournament's events and fans it out
 * to all clients.
 */
export function connect({
	role,
	send,
	signal,
	isClipSender,
	...key
}: HubKey & {
	role: BroadcastStreamRole;
	send: Client["send"];
	signal: AbortSignal;
	isClipSender: boolean;
}) {
	if (signal.aborted) return;

	let hub = hubs.get(hubId(key));
	if (!hub) {
		hub = createHub(key);
		hubs.set(hubId(key), hub);
		void subscribeToTournamentEvents(hub);
		void rebuild(hub);
	}

	const client: Client = {
		role,
		send,
		peerId: crypto.randomUUID(),
		token: crypto.randomUUID(),
		isClipSender,
	};
	send(
		JSON.stringify({
			kind: "hello",
			peer: { id: client.peerId, token: client.token },
			now: Date.now(),
		} satisfies BroadcastStreamMessage),
	);
	hub.clients.add(client);
	signal.addEventListener("abort", () => disconnect(hub, client), {
		once: true,
	});
	publishPeers(hub);

	if (hub.snapshot && !publish(hub)) {
		send(serialize(withHealth(hub, hub.snapshot)));
	}
}

/**
 * Passes a WebRTC session description from the client the token belongs to on to the peer, when one of them is a
 * clip sender and the other is not. Returns whether it was passed on.
 */
export function relaySignal({
	token,
	to,
	description,
	...key
}: HubKey & {
	token: string;
	to: string;
	description: BroadcastSessionDescription;
}) {
	const hub = hubs.get(hubId(key));
	if (!hub) return false;

	const clients = Array.from(hub.clients);
	const from = clients.find((client) => client.token === token);
	const target = clients.find((client) => client.peerId === to);
	if (!from || !target || from.isClipSender === target.isClipSender) {
		return false;
	}

	target.send(
		JSON.stringify({
			kind: "signal",
			from: from.peerId,
			description,
		} satisfies BroadcastStreamMessage),
	);

	return true;
}

/** Whether the broadcast has as many clients as it takes, its URLs being public. */
export function isAtCapacity(key: HubKey) {
	return (hubs.get(hubId(key))?.clients.size ?? 0) >= BROADCAST_MAX_CONNECTIONS;
}

/** Rebuilds the broadcast's state for its clients, e.g. after the producer changed it. */
export function refresh(key: HubKey) {
	const hub = hubs.get(hubId(key));
	if (!hub) return;

	void rebuild(hub);
}

/** Applies what the scanner saw to the broadcast, see `Producer.applyGameSignal`. */
export async function applyGameSignal({
	signal,
	...key
}: HubKey & { signal: BroadcastGameSignal }) {
	const built = await BroadcastSnapshot.build(key);
	if (!built) return;

	const isChanged = await BroadcastRepository.updateProducer({
		tournamentId: key.tournamentId,
		channel: built.channel,
		change: (state) =>
			Producer.applyGameSignal(state, {
				signal,
				liveResults: reportedResults(built.snapshot),
				now: Date.now(),
			}),
	});

	if (isChanged) refresh(key);
}

/** Freshly built state of the broadcast with its current connection counts, `null` when the tournament has no cast channel by the slug. */
export async function buildState(key: HubKey) {
	const built = await BroadcastSnapshot.build(key);
	if (!built) return null;

	const state: BroadcastState = { ...built.snapshot, health: health(key) };

	return { state, channel: built.channel };
}

function health(key: HubKey): BroadcastHealth {
	const hub = hubs.get(hubId(key));
	if (!hub) return { sources: 0, scanners: 0 };

	return healthOf(hub);
}

function hubId({ tournamentId, slug }: HubKey) {
	return `${tournamentId}:${slug}`;
}

function createHub(key: HubKey): Hub {
	return {
		...key,
		clients: new Set(),
		snapshot: null,
		lastSentMessage: null,
		eventChannels: [tournamentChannel(key.tournamentId)],
		stop: new AbortController(),
		resubscribe: new AbortController(),
		rebuildTimer: null,
		autoTakeTimer: null,
		isBuilding: false,
		isDirty: false,
	};
}

function disconnect(hub: Hub, client: Client) {
	hub.clients.delete(client);

	if (hub.clients.size > 0) {
		publish(hub);
		publishPeers(hub);
		return;
	}

	hub.stop.abort();
	if (hub.rebuildTimer) clearTimeout(hub.rebuildTimer);
	if (hub.autoTakeTimer) clearTimeout(hub.autoTakeTimer);
	if (hubs.get(hubId(hub)) === hub) hubs.delete(hubId(hub));
}

/** Resubscribes whenever the state depends on other channels, e.g. another match got featured. */
async function subscribeToTournamentEvents(hub: Hub) {
	while (!hub.stop.signal.aborted) {
		hub.resubscribe = new AbortController();

		for await (const _event of EventBus.subscribe(
			hub.eventChannels,
			AbortSignal.any([hub.stop.signal, hub.resubscribe.signal]),
		)) {
			scheduleRebuild(hub);
		}
	}
}

function scheduleRebuild(hub: Hub) {
	if (hub.rebuildTimer) return;

	hub.rebuildTimer = setTimeout(() => {
		hub.rebuildTimer = null;
		void rebuild(hub);
	}, REBUILD_DEBOUNCE_MS);
}

async function rebuild(hub: Hub) {
	if (hub.isBuilding) {
		hub.isDirty = true;
		return;
	}

	hub.isBuilding = true;
	try {
		do {
			hub.isDirty = false;

			const built = await BroadcastSnapshot.build(hub);
			if (!built || hub.stop.signal.aborted) continue;

			hub.snapshot = built.snapshot;
			scheduleAutoTake(hub);
			if (!R.isDeepEqual(built.eventChannels, hub.eventChannels)) {
				hub.eventChannels = built.eventChannels;
				hub.resubscribe.abort();
			}

			publish(hub);
		} while (hub.isDirty && !hub.stop.signal.aborted);
	} catch (error) {
		logger.error("Building the broadcast state failed", error);
	} finally {
		hub.isBuilding = false;
	}
}

/**
 * Times the automatic Take of the staged item, replacing the one timed before. One overdue, e.g. as the server
 * restarted while a clip played, is taken right away.
 */
function scheduleAutoTake(hub: Hub) {
	if (hub.autoTakeTimer) clearTimeout(hub.autoTakeTimer);
	hub.autoTakeTimer = null;

	const snapshot = hub.snapshot;
	const takeAt = snapshot ? Producer.autoTakeAt(snapshot) : null;
	if (!snapshot || takeAt === null || hub.stop.signal.aborted) return;

	hub.autoTakeTimer = setTimeout(
		() => {
			hub.autoTakeTimer = null;
			autoTake(hub, snapshot.takeId).catch((error) =>
				logger.error("Automatic Take failed", error),
			);
		},
		Math.max(0, takeAt - Date.now()),
	);
}

/**
 * Takes like the producer would, unless a Take or a change to the staged item since the take it was timed after
 * made it not due anymore. The results reported by then go on air with it.
 */
async function autoTake(hub: Hub, takeId: number) {
	const built = await BroadcastSnapshot.build(hub);
	if (!built || hub.stop.signal.aborted) return;

	const liveResults = reportedResults(built.snapshot);
	const isTaken = await BroadcastRepository.updateProducer({
		tournamentId: hub.tournamentId,
		channel: built.channel,
		change: (state) => {
			const takeAt = Producer.autoTakeAt(state);
			const now = Date.now();
			if (
				state.takeId !== takeId ||
				takeAt === null ||
				takeAt > now + AUTO_TAKE_TOLERANCE_MS
			) {
				return null;
			}

			return Producer.take(state, { liveResults, now });
		},
	});

	if (isTaken) await rebuild(hub);
}

/** Sends the current state to every client unless it is what they already have. Returns whether it was sent. */
function publish(hub: Hub) {
	if (!hub.snapshot) return false;

	const message = serialize(withHealth(hub, hub.snapshot));
	if (message === hub.lastSentMessage) return false;

	hub.lastSentMessage = message;
	for (const client of hub.clients) {
		client.send(message);
	}

	return true;
}

/** Tells the clip senders who they can send clips to. */
function publishPeers(hub: Hub) {
	const peers: BroadcastPeer[] = [];
	for (const client of hub.clients) {
		if (!client.isClipSender && client.role !== "scanner") {
			peers.push({ id: client.peerId, role: client.role });
		}
	}

	const message = JSON.stringify({
		kind: "peers",
		peers,
	} satisfies BroadcastStreamMessage);
	for (const client of hub.clients) {
		if (client.isClipSender) client.send(message);
	}
}

function serialize(state: BroadcastState) {
	const message: BroadcastStreamMessage = { kind: "state", state };

	return JSON.stringify(message);
}

function withHealth(
	hub: Hub,
	snapshot: BroadcastSnapshot.Snapshot,
): BroadcastState {
	return { ...snapshot, health: healthOf(hub) };
}

function healthOf(hub: Hub): BroadcastHealth {
	let sources = 0;
	let scanners = 0;
	for (const client of hub.clients) {
		if (client.role === "source") sources++;
		if (client.role === "scanner") scanners++;
	}

	return { sources, scanners };
}

/** The featured match's results reported by now, what a Take made now puts on air. */
function reportedResults(snapshot: BroadcastSnapshot.Snapshot) {
	const { match } = snapshot;

	return match
		? { matchId: match.id, count: match.progress.next.resultCount }
		: null;
}
