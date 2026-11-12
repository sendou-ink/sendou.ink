/**
 * Modules worth a mutation run when a diff touches them: pure rules whose mistakes show up as a
 * wrong pairing, an illegal map or a skewed rating rather than as a crash. A directory stands
 * for every source file in it. `pnpm mutate --recommended` runs them all.
 */
export const RECOMMENDED_TARGETS = [
	"app/features/tournament-bracket/core/engine",
	"app/features/tournament-bracket/core/Bracket",
	"app/features/tournament-bracket/core/PickBan.ts",
	"app/features/tournament-bracket/core/Progression.ts",
	"app/features/tournament-bracket/core/Seeding.ts",
	"app/features/tournament-bracket/core/rounds.ts",
	"app/features/tournament-bracket/core/toMapList.ts",
	"app/features/tournament-bracket/core/summarizer.server.ts",
	"app/features/mmr/mmr-utils.ts",
	"app/features/mmr/mmr-utils.server.ts",
	"app/features/mmr/tiered.server.ts",
	"app/features/mmr/core/Seasons.ts",
	"app/modules/tournament-map-list-generator",
	"app/features/sendouq/core/SendouQ.server.ts",
	"app/features/lobbies/core/LobbyRating.ts",
	"app/features/lobbies/core/TeamShuffle.ts",
	"app/features/lobbies/core/WeaponRoll.ts",
	"app/features/scrims/core",
];
