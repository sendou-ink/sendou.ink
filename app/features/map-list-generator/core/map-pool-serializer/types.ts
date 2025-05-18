import type { ModeShort, StageId } from "../../../../modules/in-game-lists";

export type MapPoolObject = Record<ModeShort, StageId[]>;
export type ReadonlyMapPoolObject = Readonly<
	Record<ModeShort, readonly StageId[]>
>;
