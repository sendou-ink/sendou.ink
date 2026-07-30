/** The `type` column of `UnvalidatedVideo` and the `Video` view is typed off this. */
export const videoMatchTypes = [
	"TOURNAMENT",
	"CAST",
	"SCRIM",
	"MATCHMAKING",
	"SENDOUQ",
] as const;

export const VODS_PAGE_BATCH_SIZE = 24;
