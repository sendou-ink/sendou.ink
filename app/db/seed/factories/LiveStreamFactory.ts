import type { TablesInsertable } from "~/db/tables";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import { faker } from "../core/faker";

type Stream = Omit<TablesInsertable["LiveStream"], "id">;

type StreamOverrides = Partial<Stream> & Pick<Stream, "userId">;

/**
 * Replaces the live streams with one per entry, the same write the twitch poller
 * does. A later call replaces the earlier's streams, so seed them all at once.
 */
export function replaceAll(streams: StreamOverrides[]) {
	return LiveStreamRepository.replaceAll(streams.map(fillStream));
}

function fillStream(overrides: StreamOverrides): Stream {
	return {
		viewerCount: faker.helpers.weightedArrayElement([
			{ value: faker.number.int({ min: 5, max: 30 }), weight: 5 },
			{ value: faker.number.int({ min: 31, max: 100 }), weight: 3 },
			{ value: faker.number.int({ min: 101, max: 500 }), weight: 2 },
			{ value: faker.number.int({ min: 501, max: 2000 }), weight: 1 },
		]),
		thumbnailUrl: faker.image.urlPicsumPhotos({ width: 320, height: 180 }),
		twitch: `stream_${overrides.userId}`,
		...overrides,
	};
}
