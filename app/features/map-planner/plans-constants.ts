import type { StageBackgroundStyle, StageWaterLevel } from "./plans-types";

/** Keys the tldraw document persisted in IndexedDB, letting a plan survive leaving the page. */
export const PLANNER_PERSISTENCE_KEY = "map-planner";

/** Backgrounds the planner offers, a subset of the styles the image url builder supports. */
export const PLANNER_BACKGROUND_STYLES = [
	"MINI",
	"OVER",
] as const satisfies readonly StageBackgroundStyle[];

export const STAGE_WATER_LEVELS = [
	"up",
	"down",
] as const satisfies readonly StageWaterLevel[];
