import type { ModeShort, StageId } from "@sendou/in-game-lists/types";

export type MapPoolObject = Record<ModeShort, StageId[]>;
export type ReadonlyMapPoolObject = Readonly<
	Record<ModeShort, readonly StageId[]>
>;
