import type { Tables } from "~/db/tables";
import { assertType } from "~/utils/types";

export const videoMatchTypes = [
	"TOURNAMENT",
	"CAST",
	"SCRIM",
	"MATCHMAKING",
	"SENDOUQ",
] as const;
assertType<
	(typeof videoMatchTypes)[number],
	Array<Tables["Video"]["type"]>[number]
>();

export const VODS_PAGE_BATCH_SIZE = 24;
