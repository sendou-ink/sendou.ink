import * as React from "react";

export interface BroadcastClips {
	/** Object URLs of the clips the overlay has received, by clip id. */
	urls: ReadonlyMap<string, string>;
	isMuted: boolean;
	/** How far ahead the server's clock is, to play a clip from where it is on air and to count down by. */
	clockOffsetMs: number;
}

/** Replay clips the overlay page received from the dashboard over WebRTC. */
export const BroadcastClipsContext = React.createContext<BroadcastClips>({
	urls: new Map(),
	isMuted: true,
	clockOffsetMs: 0,
});
