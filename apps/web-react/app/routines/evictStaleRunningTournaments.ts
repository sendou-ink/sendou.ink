import { evictStaleRunningTournaments } from "~/features/tournament-bracket/core/Tournament.server";
import { Routine } from "./routine.server";

export const EvictStaleRunningTournamentsRoutine = new Routine({
	name: "EvictStaleRunningTournaments",
	func: async () => evictStaleRunningTournaments(),
});
