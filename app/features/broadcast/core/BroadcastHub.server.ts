import * as EventBus from "~/features/events/core/EventBus.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentMatchChannel } from "~/features/tournament-match/tournament-match-utils";
import { logger } from "~/utils/logger";
import { BROADCAST_MAX_CONNECTIONS } from "../broadcast-constants";
import type {
	BroadcastHealth,
	BroadcastState,
	BroadcastStreamMessage,
	BroadcastStreamRole,
} from "../broadcast-types";
import * as BroadcastSnapshot from "./BroadcastSnapshot.server";

// one event often comes with others (a report also ends the set and advances the bracket)
const REBUILD_DEBOUNCE_MS = 250;

interface HubKey {
	tournamentId: number;
	slug: string;
}

interface Client {
	role: BroadcastStreamRole;
	/** Gets a serialized {@link BroadcastStreamMessage}. */
	send: (message: string) => void;
}

interface Hub extends HubKey {
	clients: Set<Client>;
	snapshot: BroadcastSnapshot.Snapshot | null;
	lastSentMessage: string | null;
	featuredMatchId: number | null;
	stop: AbortController;
	resubscribe: AbortController;
	rebuildTimer: ReturnType<typeof setTimeout> | null;
	isBuilding: boolean;
	isDirty: boolean;
}

declare global {
	var __broadcastHubs: Map<string, Hub> | undefined;
}

// on globalThis so open streams survive the dev server re-evaluating this module
globalThis.__broadcastHubs ??= new Map();
const hubs = globalThis.__broadcastHubs;

/**
 * Connects a client to the broadcast: it gets the current state right away (once built) and every change after,
 * until the signal aborts. One hub per broadcast rebuilds the state on the tournament's events and fans it out
 * to all clients.
 */
export function connect({
	role,
	send,
	signal,
	...key
}: HubKey & {
	role: BroadcastStreamRole;
	send: Client["send"];
	signal: AbortSignal;
}) {
	if (signal.aborted) return;

	let hub = hubs.get(hubId(key));
	if (!hub) {
		hub = createHub(key);
		hubs.set(hubId(key), hub);
		void subscribeToTournamentEvents(hub);
		void rebuild(hub);
	}

	const client: Client = { role, send };
	hub.clients.add(client);
	signal.addEventListener("abort", () => disconnect(hub, client), {
		once: true,
	});

	if (hub.snapshot && !publish(hub)) {
		send(serialize(withHealth(hub, hub.snapshot)));
	}
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

/** Freshly built state of the broadcast with its current connection counts, `null` when the tournament has no cast channel by the slug. */
export async function buildState(key: HubKey) {
	const built = await BroadcastSnapshot.build(key);
	if (!built) return null;

	const state: BroadcastState = { ...built.snapshot, health: health(key) };

	return { state, channel: built.channel };
}

function health(key: HubKey): BroadcastHealth {
	const hub = hubs.get(hubId(key));
	if (!hub) return { sources: 0 };

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
		featuredMatchId: null,
		stop: new AbortController(),
		resubscribe: new AbortController(),
		rebuildTimer: null,
		isBuilding: false,
		isDirty: false,
	};
}

function disconnect(hub: Hub, client: Client) {
	hub.clients.delete(client);

	if (hub.clients.size > 0) {
		publish(hub);
		return;
	}

	hub.stop.abort();
	if (hub.rebuildTimer) clearTimeout(hub.rebuildTimer);
	if (hubs.get(hubId(hub)) === hub) hubs.delete(hubId(hub));
}

/** Resubscribes whenever the featured match changes, its events go to the match's own channel. */
async function subscribeToTournamentEvents(hub: Hub) {
	while (!hub.stop.signal.aborted) {
		hub.resubscribe = new AbortController();
		const channels = [
			tournamentChannel(hub.tournamentId),
			...(hub.featuredMatchId
				? [tournamentMatchChannel(hub.featuredMatchId)]
				: []),
		];

		for await (const _event of EventBus.subscribe(
			channels,
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
			const featuredMatchId = built.snapshot.match?.id ?? null;
			if (featuredMatchId !== hub.featuredMatchId) {
				hub.featuredMatchId = featuredMatchId;
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
	for (const client of hub.clients) {
		if (client.role === "source") sources++;
	}

	return { sources };
}
