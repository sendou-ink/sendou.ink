import type { Tables } from "~/db/tables";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	mapPoolToSerializedString,
	serializedStringToMapPool,
} from "./map-pool-serializer/serializer";
import type {
	MapPoolObject,
	ReadonlyMapPoolObject,
} from "./map-pool-serializer/types";

export type DbMapPoolList = Array<
	Pick<Tables["MapPoolMap"], "stageId" | "mode">
>;

export class MapPool {
	private readonly source: string | ReadonlyMapPoolObject;
	private asSerialized?: string;
	private asObject?: ReadonlyMapPoolObject;

	constructor(init: ReadonlyMapPoolObject | string | DbMapPoolList) {
		this.source = Array.isArray(init)
			? this.mapPoolListToMapPoolObject(init)
			: init;
	}

	static serialize(init: ReadonlyMapPoolObject | string | DbMapPoolList) {
		return new MapPool(init).serialized;
	}

	static toDbList(init: MapPoolObject | string | DbMapPoolList) {
		return new MapPool(init).dbList;
	}

	/** Reads a map pool typed or pasted by a user: a link with a `pool` param, a query string or a bare serialized pool. Null if no stages could be read. */
	static fromUserInput(input: string): MapPool | null {
		const serialized = extractSerializedPool(input);
		if (!serialized) return null;

		try {
			const pool = new MapPool(serialized);
			if (pool.isEmpty()) return null;
			return pool;
		} catch {
			return null;
		}
	}

	get serialized(): string {
		if (this.asSerialized !== undefined) {
			return this.asSerialized;
		}

		this.asSerialized =
			typeof this.source === "string"
				? this.source
				: mapPoolToSerializedString(this.source);

		return this.asSerialized;
	}

	get parsed(): ReadonlyMapPoolObject {
		if (this.asObject !== undefined) {
			return this.asObject;
		}

		this.asObject =
			typeof this.source === "string"
				? serializedStringToMapPool(this.source)
				: this.source;

		return this.asObject;
	}

	get stages() {
		return Object.values(this.parsed).flat();
	}

	get modes() {
		return Object.keys(this.parsed).filter(
			(key) => this.parsed[key as ModeShort].length > 0,
		) as ModeShort[];
	}

	get stageModePairs(): DbMapPoolList {
		return Object.entries(this.parsed).flatMap(([mode, stages]) =>
			stages.map((stageId) => ({ mode: mode as ModeShort, stageId })),
		);
	}

	/** Same pairs as `stageModePairs`, in the shape the database stores. */
	get dbList(): DbMapPoolList {
		return this.stageModePairs;
	}

	has({ stageId, mode }: { stageId: StageId; mode: ModeShort }) {
		return this.parsed[mode].includes(stageId);
	}

	hasMode(mode: ModeShort): boolean {
		return this.parsed[mode].length > 0;
	}

	hasStage(stageId: StageId): boolean {
		return Object.values(this.parsed).some((stages) =>
			stages.includes(stageId),
		);
	}

	isEmpty(): boolean {
		return Object.values(this.parsed).every((stages) => stages.length === 0);
	}

	countMapsByMode(mode: ModeShort): number {
		return this.parsed[mode].length;
	}

	get length() {
		return this.stageModePairs.length;
	}

	toString() {
		return this.serialized;
	}

	toJSON() {
		return this.parsed;
	}

	[Symbol.iterator]() {
		let index = -1;
		const data = this.stageModePairs;

		return {
			next: () => ({ value: data[++index], done: !(index in data) }),
		};
	}

	private mapPoolListToMapPoolObject(
		mapPoolList: Array<Pick<Tables["MapPoolMap"], "stageId" | "mode">>,
	) {
		const result: MapPoolObject = {
			TW: [],
			SZ: [],
			TC: [],
			RM: [],
			CB: [],
		};

		for (const { stageId, mode } of mapPoolList) {
			result[mode].push(stageId);
		}

		return result;
	}

	static EMPTY = new MapPool({
		SZ: [],
		TC: [],
		CB: [],
		RM: [],
		TW: [],
	});

	static ALL = new MapPool({
		SZ: [...stageIds],
		TC: [...stageIds],
		CB: [...stageIds],
		RM: [...stageIds],
		TW: [...stageIds],
	});

	static ANARCHY = new MapPool({
		SZ: [...stageIds],
		TC: [...stageIds],
		CB: [...stageIds],
		RM: [...stageIds],
		TW: [],
	});

	static SZ = new MapPool({
		...MapPool.EMPTY.parsed,
		SZ: [...stageIds],
	});
	static CB = new MapPool({
		...MapPool.EMPTY.parsed,
		CB: [...stageIds],
	});
}

function extractSerializedPool(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (trimmed.includes("://")) {
		try {
			const url = new URL(trimmed);
			// biome-ignore lint/plugin: URL pasted by the user, not one this app routed to
			return url.searchParams.get("pool");
		} catch {
			return null;
		}
	}

	if (trimmed.includes("pool=")) {
		const queryString = trimmed.slice(trimmed.indexOf("?") + 1);
		return new URLSearchParams(queryString).get("pool");
	}

	return trimmed;
}
