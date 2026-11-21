import * as React from "react";
import type { BroadcastAudioFeed } from "./broadcast-types";

export interface BroadcastClips {
	/** Object URLs of the clips the overlay has received, by clip id. */
	urls: ReadonlyMap<string, string>;
	/** Not the page OBS takes the sound from (the dashboard's previews, the designer): clips play muted, cameras are left out. */
	isMuted: boolean;
	/** How far ahead the server's clock is, to play a clip from where it is on air and to count down by. */
	clockOffsetMs: number;
	/** Reports the overlay's audio feeds back to the dashboards over the clips' channels. */
	reportFeeds: (feeds: BroadcastAudioFeed[]) => void;
}

/** Replay clips the overlay page received from the dashboard over WebRTC. */
export const BroadcastClipsContext = React.createContext<BroadcastClips>({
	urls: new Map(),
	isMuted: true,
	clockOffsetMs: 0,
	reportFeeds: () => {},
});
