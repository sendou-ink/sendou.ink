/** What a VDO.ninja view link embedded as an iframe tells its page, of what the casters' feeds need. */
export type Message =
	/** Asked for with `{ getLoudness: true }`, then several times a second, also while silent. */
	| { type: "loudness"; loudness: number }
	/** As the stream (dis)connects, and as the answer to `{ getStreamIDs: true }`. */
	| { type: "connection"; isConnected: boolean };

/**
 * Reads a message the VDO.ninja iframe posted, `null` for one of the many others it posts. A view link shows one
 * stream: the loudest of the streams it reports is taken, and it is connected while it lists any.
 */
export function parse(data: unknown): Message | null {
	if (!isObject(data)) return null;

	if (isObject(data.loudness)) {
		const levels = Object.values(data.loudness)
			.map(Number)
			.filter(Number.isFinite);
		if (levels.length === 0) return null;

		return { type: "loudness", loudness: Math.max(0, ...levels) };
	}

	if (data.action === "view-connection" && typeof data.value === "boolean") {
		return { type: "connection", isConnected: data.value };
	}

	if (isObject(data.streamIDs)) {
		return {
			type: "connection",
			isConnected: Object.keys(data.streamIDs).length > 0,
		};
	}

	return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
