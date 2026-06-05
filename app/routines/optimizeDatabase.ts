import { CompiledQuery } from "kysely";
import { db } from "../db/sql";
import { Routine } from "./routine.server";

export const OptimizeDatabaseRoutine = new Routine({
	name: "OptimizeDatabase",
	func: async () => {
		await db.executeQuery(CompiledQuery.raw("PRAGMA optimize"));
	},
});
