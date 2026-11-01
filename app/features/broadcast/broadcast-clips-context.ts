import * as React from "react";

export interface BroadcastClips {
	/** Object URLs of the clips the overlay has received, by clip id. */
	urls: ReadonlyMap<string, string>;
	isMuted: boolean;
}

/** Replay clips the overlay page received from the dashboard over WebRTC. */
export const BroadcastClipsContext = React.createContext<BroadcastClips>({
	urls: new Map(),
	isMuted: true,
});
