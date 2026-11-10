import type * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import { CAST_PRODUCER_RULES } from "./broadcast-cast-constants";
import type { CastBroadcastState } from "./broadcast-cast-types";
import * as CastSnapshot from "./core/CastSnapshot.server";

/** The cast overlay as it registers into `BroadcastHub`. */
export const CAST_LAYOUT: BroadcastHub.Layout<CastBroadcastState> = {
	producer: CAST_PRODUCER_RULES,
	build: CastSnapshot.build,
};
