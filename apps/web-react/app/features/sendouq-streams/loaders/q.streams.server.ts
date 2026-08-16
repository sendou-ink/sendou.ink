import { cachedStreams } from "../core/streams.server";

export const loader = async () => {
	return {
		streams: await cachedStreams(),
	};
};
