import type { InputStage, Stage } from "~/modules/brackets-model";
import { create } from "./create";
import { Delete } from "./delete";
import { Find } from "./find";
import { Get } from "./get";
import * as helpers from "./helpers";
import { Reset } from "./reset";
import type {
	CrudInterface,
	DataTypes,
	Database,
	Storage,
	Table,
} from "./types";
import { Update } from "./update";

/**
 * A class to handle tournament management at those levels: `stage`, `group`, `round` and `match`.
 */
export class BracketsManager {
	public storage: Storage;

	public get: Get;
	public update: Update;
	public delete: Delete;
	public find: Find;
	public reset: Reset;

	/**
	 * Creates an instance of BracketsManager, which will handle all the stuff from the library.
	 *
	 * @param storageInterface An implementation of CrudInterface.
	 */
	constructor(storageInterface: CrudInterface) {
		const storage = storageInterface as Storage;

		storage.selectFirst = <T extends Table>(
			table: T,
			filter: Partial<DataTypes[T]>,
		): DataTypes[T] | null => {
			const results = this.storage.select<T>(table, filter);
			if (!results || results.length === 0) return null;
			return results[0];
		};

		storage.selectLast = <T extends Table>(
			table: T,
			filter: Partial<DataTypes[T]>,
		): DataTypes[T] | null => {
			const results = this.storage.select<T>(table, filter);
			if (!results || results.length === 0) return null;
			return results[results.length - 1];
		};

		this.storage = storage;
		this.get = new Get(this.storage);
		this.update = new Update(this.storage);
		this.delete = new Delete(this.storage);
		this.find = new Find(this.storage);
		this.reset = new Reset(this.storage);
	}

	/**
	 * Creates a stage for an existing tournament. The tournament won't be created.
	 *
	 * @param stage A stage to create.
	 */
	public create(stage: InputStage): Stage {
		return create.call(this, stage);
	}

	/**
	 * Imports data in the database.
	 *
	 * @param data Data to import.
	 * @param normalizeIds Enable ID normalization: all IDs (and references to them) are remapped to consecutive IDs starting from 0.
	 */
	public import(rawData: Database, normalizeIds = false): void {
		const data = normalizeIds ? helpers.normalizeIds(rawData) : rawData;

		if (!this.storage.delete("stage"))
			throw Error("Could not empty the stage table.");
		if (!this.storage.insert("stage", data.stage))
			throw Error("Could not import stages.");

		if (!this.storage.delete("group"))
			throw Error("Could not empty the group table.");
		if (!this.storage.insert("group", data.group))
			throw Error("Could not import groups.");

		if (!this.storage.delete("round"))
			throw Error("Could not empty the round table.");
		if (!this.storage.insert("round", data.round))
			throw Error("Could not import rounds.");

		if (!this.storage.delete("match"))
			throw Error("Could not empty the match table.");
		if (!this.storage.insert("match", data.match))
			throw Error("Could not import matches.");
	}

	/**
	 * Exports data from the database.
	 */
	public export(): Database {
		const stages = this.storage.select("stage");
		if (!stages) throw Error("Error getting stages.");

		const groups = this.storage.select("group");
		if (!groups) throw Error("Error getting groups.");

		const rounds = this.storage.select("round");
		if (!rounds) throw Error("Error getting rounds.");

		const matches = this.storage.select("match");
		if (!matches) throw Error("Error getting matches.");

		return {
			stage: stages,
			group: groups,
			round: rounds,
			match: matches,
		};
	}
}
