import { BracketsManager } from "~/modules/brackets-manager";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";

export function getTournamentManager() {
	const storage = new InMemoryDatabase();
	const manager = new BracketsManager(storage);

	return manager;
}
