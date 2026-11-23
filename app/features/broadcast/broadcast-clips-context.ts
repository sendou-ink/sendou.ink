import * as React from "react";
import type { BroadcastAudioFeed } from "./broadcast-types";
import type * as ClipTransfer from "./core/ClipTransfer";

export interface BroadcastClips {
	/** Object URLs of the files the overlay has received (replay clips and music), by kind and file id. */
	files: ClipTransfer.ReceivedClips;
	/** Not the page OBS takes the sound from (the dashboard's previews, the designer): clips play muted, music and cameras are left out. */
	isMuted: boolean;
	/** How far ahead the server's clock is, to play a clip from where it is on air and to count down by. */
	clockOffsetMs: number;
	/** Reports the overlay's audio feeds back to the dashboards over the clips' channels. */
	reportFeeds: (feeds: BroadcastAudioFeed[]) => void;
}

/**
 * Defaults of an overlay receiving nothing, e.g. the designer's.
 * @internal
 */
export const NO_BROADCAST_CLIPS: BroadcastClips = {
	files: { clip: new Map(), music: new Map() },
	isMuted: true,
	clockOffsetMs: 0,
	reportFeeds: () => {},
};

/** Replay clips and music the overlay page received from the dashboard over WebRTC. */
export const BroadcastClipsContext =
	React.createContext<BroadcastClips>(NO_BROADCAST_CLIPS);
