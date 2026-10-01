import type { QueryRow } from "~/db/entity-query";
import type * as XRankPlacementRepository from "./XRankPlacementRepository.server";

/** `WEST` = Tentatek division, `JPN` = Takoroka division. */
export type XRankPlacementRegion = "WEST" | "JPN";

export type Placement = QueryRow<
	ReturnType<typeof XRankPlacementRepository.placements>
>;
