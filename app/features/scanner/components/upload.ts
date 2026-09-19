/**
 * Uploading to sendou.ink, shared by the live capture, VoD scans and the
 * views' Retry/Upload buttons: one serialized sender per store, so sends
 * never overlap (a send requested mid-flight runs right after), and one
 * place that knows whether uploading is on at all (the setting, and a login).
 */
import type { BuiltMatch } from "../core/match-builder";
import { EVENTS_STORE, VOD_EVENTS_STORE } from "../store/db";
import { listEvents } from "../store/events";
import { loadVodEvents } from "../store/vods";
import { refreshFeed } from "./events-feed";
import { type SendResult, sendMatches } from "./sendou-ingest";
import type { ScanEvent } from "./session-data";
import { readSettings } from "./settings";

export type MatchSelector = (built: BuiltMatch<ScanEvent>) => boolean;

interface Sender {
	sending: boolean;
	pending: MatchSelector[];
}

let user: { id: number } | null = null;
const senders = new Map<string, Sender>();

/** The root loader's user, mirrored here for the controllers outside React. */
export function setUploadUser(next: { id: number } | null): void {
	user = next;
}

export function isLoggedIn(): boolean {
	return user !== null;
}

/** Whether results go to sendou.ink right now: the setting, and a login. */
export function uploadEnabled(): boolean {
	return user !== null && readSettings().upload;
}

/** Sends the live matches `include` selects; the feed refreshes as statuses change. */
export function sendLive(include: MatchSelector): Promise<SendResult | null> {
	return send(EVENTS_STORE, listEvents, include, refreshFeed);
}

/** Sends the VoD's matches `include` selects; `onStatus` runs after each status write. */
export function sendVod(
	name: string,
	include: MatchSelector,
	onStatus: () => void,
): Promise<SendResult | null> {
	return send(
		`${VOD_EVENTS_STORE}:${name}`,
		() => loadVodEvents(name),
		include,
		onStatus,
		VOD_EVENTS_STORE,
	);
}

async function send(
	key: string,
	loadEvents: () => Promise<ScanEvent[]>,
	include: MatchSelector,
	onStatus: () => void,
	store: string = EVENTS_STORE,
): Promise<SendResult | null> {
	if (!isLoggedIn()) return null;
	let sender = senders.get(key);
	if (!sender) {
		sender = { sending: false, pending: [] };
		senders.set(key, sender);
	}
	if (sender.sending) {
		sender.pending.push(include);
		return null;
	}
	sender.sending = true;
	const result: SendResult = { sentMatches: 0, failedMatches: 0 };
	try {
		let next: MatchSelector | undefined = include;
		while (next) {
			const events = await loadEvents();
			const pass = await sendMatches({
				events,
				include: next,
				onStatus,
				store,
			});
			result.sentMatches += pass.sentMatches;
			result.failedMatches += pass.failedMatches;
			const pending = sender.pending;
			sender.pending = [];
			next =
				pending.length > 0
					? (built) => pending.some((fn) => fn(built))
					: undefined;
		}
	} finally {
		sender.sending = false;
		onStatus();
	}
	return result;
}
