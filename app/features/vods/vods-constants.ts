import type { Video } from "~/db/types";
import { assertType } from "~/utils/types";

export const videoMatchTypes = [
	"TOURNAMENT",
	"CAST",
	"SCRIM",
	"MATCHMAKING",
	"SENDOUQ",
] as const;
assertType<(typeof videoMatchTypes)[number], Array<Video["type"]>[number]>();

// xxx: retire?
export const VOD = {
	TITLE_MAX_LENGTH: 100,
	TITLE_MIN_LENGTH: 1,
	PLAYER_NAME_MIN_LENGTH: 1,
	PLAYER_NAME_MAX_LENGTH: 100,
};

export const VODS_PAGE_BATCH_SIZE = 24;
