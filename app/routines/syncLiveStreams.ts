import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { getStreams } from "~/modules/twitch";
import { hasTwitchEnvVars } from "~/modules/twitch/utils";
import { Routine } from "./routine.server";

export const SyncLiveStreamsRoutine = new Routine({
	name: "SyncLiveStreams",
	func: syncLiveStreams,
});

async function syncLiveStreams() {
	if (!hasTwitchEnvVars()) return;

	const streams = await getStreams();

	if (streams.length === 0) {
		await LiveStreamRepository.replaceAll([]);
		return;
	}

	const streamTwitchNames = streams.map((s) => s.twitchUserName);
	const matchingUsers =
		await UserRepository.findIdsByTwitchUsernames(streamTwitchNames);

	const twitchToUserId = new Map<string, number>();
	for (const user of matchingUsers) {
		if (user.twitch) {
			twitchToUserId.set(user.twitch, user.id);
		}
	}

	const liveStreams = streams
		.filter((stream) => twitchToUserId.has(stream.twitchUserName))
		.map((stream) => ({
			userId: twitchToUserId.get(stream.twitchUserName)!,
			url: `https://twitch.tv/${stream.twitchUserName}`,
			viewerCount: stream.viewerCount,
			thumbnailUrl: stream.thumbnailUrl,
		}));

	await LiveStreamRepository.replaceAll(liveStreams);
}
