import { afterEach, describe, expect, test, vi } from "vitest";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import * as BroadcastHub from "./BroadcastHub.server";

const KEY = { tournamentId: 1, slug: "sendouink" };

const connections: AbortController[] = [];

afterEach(() => {
	for (const connection of connections) {
		connection.abort();
	}
	connections.length = 0;
});

describe("BroadcastHub.disconnectStaleKeys", () => {
	test("closes the connections let in with another key", () => {
		const withOldKey = connect("old-key");

		BroadcastHub.disconnectStaleKeys({ ...KEY, programKey: "new-key" });

		expect(withOldKey).toHaveBeenCalledOnce();
	});

	test.each([
		{ why: "the current key", programKey: "new-key" },
		{ why: "no key (a producer)", programKey: null },
	])("keeps the connections let in with $why", ({ programKey }) => {
		const close = connect(programKey);

		BroadcastHub.disconnectStaleKeys({ ...KEY, programKey: "new-key" });

		expect(close).not.toHaveBeenCalled();
	});
});

function connect(programKey: string | null) {
	const connection = new AbortController();
	connections.push(connection);
	const close = vi.fn();
	BroadcastHub.connect({
		...KEY,
		layout: { producer: CAST_PRODUCER_RULES, build: async () => null },
		role: "source",
		send: () => {},
		close,
		signal: connection.signal,
		isClipSender: false,
		programKey,
	});

	return close;
}
