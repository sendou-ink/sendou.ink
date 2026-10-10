/**
 * Cross-tab handoff of a plan into the planner: the source tab stashes the
 * plan in localStorage under a fresh key, then opens the planner with
 * ?import=<key> (plus the stage and mode its header shows). Claimed plans are removed; unclaimed leftovers (blocked
 * popup) are swept by key age next time.
 */
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { PLANNER_URL } from "~/utils/urls";
import { plansSearchParams } from "../plans-search-params";

const STORAGE_KEY_PREFIX = "plans-import:";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ImportedPlan {
	/** the canvas background, as a data URL so the saved plan outlives the page */
	background: string;
	/** main weapons placed beside the background */
	allies: MainWeaponId[];
	/** main weapons placed beside the background, outlined */
	enemies: MainWeaponId[];
}

/** Claims by key, so a remount claiming again gets the same plan. */
const claims = new Map<string, ImportedPlan | null>();

/**
 * Opens the planner in a new tab with the plan set up on its canvas, replacing
 * what was there. Call from a user gesture. Rejects, opening nothing, when the
 * plan can't be stashed (e.g. storage full).
 */
export async function openInNewTab({
	background,
	allies,
	enemies,
	stageId,
	mode,
}: Omit<ImportedPlan, "background"> & {
	background: Blob;
	/** shown in the planner's header, null when unknown */
	stageId: StageId | null;
	mode: ModeShort | null;
}): Promise<void> {
	const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const plan: ImportedPlan = {
		background: await blobToDataUrl(background),
		allies,
		enemies,
	};

	sweepStale();
	localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(plan));

	window.open(
		plansSearchParams.href(PLANNER_URL, {
			import: key,
			...(stageId !== null ? { stage: stageId } : {}),
			...(mode !== null ? { mode } : {}),
		}),
		"_blank",
		"noopener",
	);
}

/** Takes (and removes) the plan stashed under `key`. Null when there's none. */
export function claim(key: string): ImportedPlan | null {
	if (claims.has(key)) return claims.get(key)!;

	const storageKey = STORAGE_KEY_PREFIX + key;
	const stashed = localStorage.getItem(storageKey);
	localStorage.removeItem(storageKey);

	const plan = stashed ? (JSON.parse(stashed) as ImportedPlan) : null;
	claims.set(key, plan);
	return plan;
}

function sweepStale() {
	const staleBefore = Date.now() - STALE_AFTER_MS;
	for (const storageKey of Object.keys(localStorage)) {
		if (!storageKey.startsWith(STORAGE_KEY_PREFIX)) continue;
		const stashedAt = Number(
			storageKey.slice(STORAGE_KEY_PREFIX.length).split("-")[0],
		);
		if (stashedAt < staleBefore) localStorage.removeItem(storageKey);
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
