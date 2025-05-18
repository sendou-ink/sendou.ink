import { BracketsManager } from "~/modules/brackets-manager";
import { SqlDatabase } from "./crud.server";

export function getServerTournamentManager() {
	const storage = new SqlDatabase();
	// TODO: fix this ts-expect-error comment
	// @ts-expect-error interface mismatch
	const manager = new BracketsManager(storage);

	return manager;
}
