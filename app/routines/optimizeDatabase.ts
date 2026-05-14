import { sql } from "../db/sql";
import { Routine } from "./routine.server";

export const OptimizeDatabaseRoutine = new Routine({
	name: "OptimizeDatabase",
	func: async () => {
		sql.pragma("optimize");
	},
});
