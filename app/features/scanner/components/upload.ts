/**
 * Uploading to sendou.ink, shared by the live capture and the views'
 * Retry/Upload buttons: one serialized sender per store, so sends
 * never overlap (a send requested mid-flight runs right after), and one
 * place that knows whether uploading is on at all (the setting, and a login).
 */
import { type BuiltMatch, buildScannerMatches } from "../core/match-builder";
import {
	compactedBuilt,
	listCompactedMatches,
	updateCompactedMatchesSend,
} from "../store/compacted-matches";
import { COMPACTED_MATCHES_STORE, EVENTS_STORE } from "../store/db";
import { listEvents, type SendStatus, updateEventsSend } from "../store/events";
import { refreshFeed } from "./events-feed";
import { type SendResult, sendMatches } from "./sendou-ingest";
import type { ScanEvent } from "./session-data";
import { readSettings } from "./settings";

export type MatchSelector = (built: BuiltMatch<ScanEvent>) => boolean;

interface SendRequest {
	include: MatchSelector;
	/** the session key built matches are loaded from */
	since: number;
}

interface SendTarget {
	load: (since: number) => Promise<BuiltMatch<ScanEvent>[]>;
	writeSend: (
		matches: readonly BuiltMatch<ScanEvent>[],
		send: SendStatus,
	) => Promise<void>;
	onStatus: (since: number) => void;
}

interface Sender {
	sending: boolean;
	pending: SendRequest[];
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

/**
 * Sends the matches `include` selects among the live events detected since
 * `since` (the key of the session they belong to); the feed refreshes from
 * there as statuses change.
 */
export function sendLive(
	include: MatchSelector,
	since: number,
): Promise<SendResult | null> {
	return send(
		EVENTS_STORE,
		{ include, since },
		{
			load: async (from) => buildScannerMatches(await listEvents(from)),
			writeSend: (matches, sendStatus) =>
				updateEventsSend(
					matches.flatMap((built) => built.sources.map((event) => event.id!)),
					sendStatus,
				),
			onStatus: refreshFeed,
		},
	);
}

/** Sends the matches `include` selects among the compacted games of the session keyed `sessionKey`. */
export function sendCompacted(
	include: MatchSelector,
	sessionKey: number,
): Promise<SendResult | null> {
	return send(
		COMPACTED_MATCHES_STORE,
		{ include, since: sessionKey },
		{
			load: async (from) =>
				(await listCompactedMatches(from)).map(compactedBuilt),
			writeSend: (matches, sendStatus) =>
				updateCompactedMatchesSend(
					matches.map((built) => built.sources[0]!.id!),
					sendStatus,
				),
			onStatus: refreshFeed,
		},
	);
}

async function send(
	key: string,
	request: SendRequest,
	target: SendTarget,
): Promise<SendResult | null> {
	if (!isLoggedIn()) return null;
	let sender = senders.get(key);
	if (!sender) {
		sender = { sending: false, pending: [] };
		senders.set(key, sender);
	}
	if (sender.sending) {
		sender.pending.push(request);
		return null;
	}
	sender.sending = true;
	const result: SendResult = { sentMatches: 0, failedMatches: 0 };
	let sentSince = request.since;
	try {
		let next: SendRequest | undefined = request;
		while (next) {
			const { since } = next;
			sentSince = Math.min(sentSince, since);
			const pass = await sendMatches({
				matches: await target.load(since),
				include: next.include,
				onStatus: () => target.onStatus(since),
				writeSend: target.writeSend,
			});
			result.sentMatches += pass.sentMatches;
			result.failedMatches += pass.failedMatches;
			const pending = sender.pending;
			sender.pending = [];
			next =
				pending.length > 0
					? {
							include: (built) => pending.some((p) => p.include(built)),
							since: Math.min(...pending.map((p) => p.since)),
						}
					: undefined;
		}
	} finally {
		sender.sending = false;
		target.onStatus(sentSince);
	}
	return result;
}
