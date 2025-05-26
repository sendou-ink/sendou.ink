import type { Tables } from "~/db/tables";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { mapPoolListToMapPoolObject } from "./map-list-generator/utils";
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
	private source: string | ReadonlyMapPoolObject;
	private asSerialized?: string;
	private asObject?: ReadonlyMapPoolObject;

	constructor(init: ReadonlyMapPoolObject | string | DbMapPoolList) {
		this.source = Array.isArray(init) ? mapPoolListToMapPoolObject(init) : init;
	}

	static serialize(init: ReadonlyMapPoolObject | string | DbMapPoolList) {
		return new MapPool(init).serialized;
	}

	static parse(init: MapPoolObject | string | DbMapPoolList) {
		return new MapPool(init).parsed;
	}

	static toDbList(init: MapPoolObject | string | DbMapPoolList) {
		return new MapPool(init).dbList;
	}

	get serialized(): string {
		if (this.asSerialized !== undefined) {
			return this.asSerialized;
		}

		// biome-ignore lint/suspicious/noAssignInExpressions: biome migration
		return (this.asSerialized =
			typeof this.source === "string"
				? this.source
				: mapPoolToSerializedString(this.source));
	}

	get parsed(): ReadonlyMapPoolObject {
		if (this.asObject !== undefined) {
			return this.asObject;
		}

		// biome-ignore lint/suspicious/noAssignInExpressions: biome migration
		return (this.asObject =
			typeof this.source === "string"
				? serializedStringToMapPool(this.source)
				: this.source);
	}

	get dbList(): DbMapPoolList {
		return Object.entries(this.parsed).flatMap(([mode, stages]) =>
			stages.flatMap((stageId) => ({ mode: mode as ModeShort, stageId })),
		);
	}

	get stages() {
		return Object.values(this.parsed).flat();
	}

	get stageModePairs() {
		return Object.entries(this.parsed).flatMap(([mode, stages]) =>
			stages.map((stageId) => ({ mode: mode as ModeShort, stageId })),
		);
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

	overlaps(other: MapPool): boolean {
		return this.stageModePairs.some((pair) => other.has(pair));
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

	getClonedObject() {
		return structuredClone(this.parsed) as MapPoolObject;
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
	static TC = new MapPool({
		...MapPool.EMPTY.parsed,
		TC: [...stageIds],
	});
	static CB = new MapPool({
		...MapPool.EMPTY.parsed,
		CB: [...stageIds],
	});
	static RM = new MapPool({
		...MapPool.EMPTY.parsed,
		RM: [...stageIds],
	});
	static TW = new MapPool({
		...MapPool.EMPTY.parsed,
		TW: [...stageIds],
	});
}
