export const sourceTypes = [
	"DEFAULT",
	"RANDOM",
	"BOTH",
	"TO",
	"COUNTERPICK",
	"ROLL",
] as const;

/** How many distinct recently played maps per team the map list generator remembers, enough for a team to go through a six map pool in Bo3s. */
export const RECENTLY_PLAYED_MAPS_WINDOW = 20;
