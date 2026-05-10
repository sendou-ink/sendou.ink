import { BracketsManager } from "~/modules/brackets-manager";
import { SqlDatabase } from "./crud.server";

export function getServerTournamentManager() {
	const storage = new SqlDatabase();
	const manager = new BracketsManager(storage);

	return manager;
}
