import * as React from "react";
import type { BroadcastObsAudio } from "./broadcast-types";

/** How the overlay page opened from a user's OBS URL mutes the capture card, `null` everywhere else. */
export const BroadcastObsAudioContext =
	React.createContext<BroadcastObsAudio | null>(null);
