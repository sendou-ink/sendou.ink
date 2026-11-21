/** Types `Video.type`. */
export const videoMatchTypes = [
	"TOURNAMENT",
	"CAST",
	"SCRIM",
	"MATCHMAKING",
	"SENDOUQ",
] as const;

export const VODS_PAGE_BATCH_SIZE = 24;

export const VOD = {
	TITLE_MAX_LENGTH: 100,
	POV_NAME_MAX_LENGTH: 100,
};
