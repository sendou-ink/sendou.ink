/**
 * The event shape every view renders, whichever store it came from: a live
 * detection (`StoredEvent`) or a VoD's (`StoredVodEvent`) — both carry the
 * detection, an optional thumbnail/frame and the /ingest send status.
 */
import type { DetectedEvent } from "../core/detectors/types";
import type { SendStatus } from "../store/events";

export interface ScanEvent extends DetectedEvent {
	id?: number;
	/** wall-clock ms of detection; live events only */
	detectedAt?: number;
	/** small JPEG data URL of the source frame */
	thumbnail?: string;
	/** whether a full-res frame can be loaded for the event */
	hasFrame?: boolean;
	send?: SendStatus;
}

export type SessionKind = "live" | "session" | "vod";
