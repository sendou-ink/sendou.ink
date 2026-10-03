/**
 * The event shape every view renders, whichever store it came from: a live
 * detection (`StoredEvent`) or a VoD's (`StoredVodEvent`) — both carry the
 * detection and an optional frame; live ones also their /ingest send status.
 */
import type { DetectedEvent } from "../core/detectors/types";
import type { SendStatus } from "../store/events";

export interface ScanEvent extends DetectedEvent {
	id?: number;
	/** wall-clock ms of detection; live events only */
	detectedAt?: number;
	/** whether a full-res frame can be loaded for the event */
	hasFrame?: boolean;
	/** live events only */
	send?: SendStatus;
}

export type SessionKind = "live" | "session" | "vod";

/** Lazily loads an event's analyzed frame (IndexedDB keeps them out of the listed records). */
export type GetFrame = () => Promise<Blob | null | undefined>;
