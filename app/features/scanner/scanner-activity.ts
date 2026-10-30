/**
 * What the site header knows about the scanner. Kept free of the capture's
 * code on purpose: the header imports this on every page, while the capture
 * (live-session.ts and everything behind it) only loads once a capture is
 * started or the header's scanner popover is opened. The capture publishes
 * nothing but its status transitions here, so a running capture never
 * re-renders the header per frame or per detection.
 */
import * as React from "react";
import * as v from "valibot";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export type ScannerCaptureStatus = "idle" | "starting" | "running" | "error";

/** What the header's scanner panel shows, from the running capture or the components showcase. */
export interface ScannerActivityState {
	status: ScannerCaptureStatus;
	error: string | null;
	/** wall-clock ms the capture started */
	since: number | null;
	/** the capture source's name, e.g. the capture card */
	sourceName: string | null;
	/** the capture's own stream, previewed while the panel is open */
	stream: MediaStream | null;
	/** the game being read right now */
	game: {
		mode: ModeShort | null;
		stageId: StageId | null;
		/** latest objective counter read, in on-screen order */
		score: [number, number] | null;
	} | null;
	uploadingCount: number;
	/** the running session's tallies */
	stats: { games: number; uploaded: number; clips: number } | null;
}

export interface ScannerActivityActions {
	start: () => void;
	stop: () => void;
}

/** Set once this browser has captured, from then on the header offers starting a capture from any page. */
const capturedBeforePersisted = PersistedState.define({
	key: "scannerCapturedBefore",
	storage: "local",
	schema: v.boolean(),
	default: false,
});

let captureStatus: ScannerCaptureStatus = "idle";
const statusListeners = new Set<() => void>();

/** `undefined` = no override, `null` = overridden to no scanner activity */
let override: ScannerActivityState | null | undefined;
const overrideListeners = new Set<() => void>();

/** Called by the capture on every status transition. */
export function publishCaptureStatus(status: ScannerCaptureStatus) {
	if (status === captureStatus) return;

	captureStatus = status;
	if (status === "running") PersistedState.write(capturedBeforePersisted, true);
	for (const listener of statusListeners) listener();
}

export function useCaptureStatus() {
	return React.useSyncExternalStore(
		(listener) => subscribe(statusListeners, listener),
		() => captureStatus,
		() => "idle" as const,
	);
}

export function useCapturedBefore() {
	return usePersistedState(capturedBeforePersisted)[0];
}

/**
 * Replaces the header's scanner activity with a mock one, `undefined` goes
 * back to the real one. Used by the components showcase.
 */
export function setScannerActivityOverride(
	next: ScannerActivityState | null | undefined,
) {
	override = next;
	for (const listener of overrideListeners) listener();
}

export function useScannerActivityOverride() {
	return React.useSyncExternalStore(
		(listener) => subscribe(overrideListeners, listener),
		() => override,
		() => undefined,
	);
}

/** Actions of an overridden activity: they move the mock between states like the real ones would. */
export const SCANNER_OVERRIDE_ACTIONS: ScannerActivityActions = {
	start: () => updateOverride({ status: "running", since: Date.now() }),
	stop: () =>
		updateOverride({
			status: "idle",
			since: null,
			game: null,
			stats: null,
			stream: null,
		}),
};

function updateOverride(patch: Partial<ScannerActivityState>) {
	if (!override) return;
	setScannerActivityOverride({ ...override, ...patch });
}

function subscribe(listeners: Set<() => void>, listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
