import type { TieredSkill } from "../mmr/tiered.server";

export type GroupExpiryStatus = "EXPIRING_SOON" | "EXPIRED";

export type TierDifference =
	| { type: "exact"; diff: number; tier: TieredSkill["tier"] }
	| {
			type: "range";
			diff: [number, number];
			range: [TieredSkill["tier"], TieredSkill["tier"]];
	  };

export type TierRange = Omit<
	Extract<TierDifference, { type: "range" }>,
	"type"
>;
