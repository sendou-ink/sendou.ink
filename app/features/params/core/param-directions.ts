/**
 * Whether a higher value is better ("higher") or worse ("lower") for the player who owns
 * the weapon. `null` means the direction is unknown / context-dependent.
 */
type ParamDirection = "higher" | "lower" | null;

/**
 * How a value change between two patches affected the weapon: a `"buff"` made it stronger,
 * a `"nerf"` made it weaker, and `"neutral"` is either an unclassified parameter or a change
 * whose impact direction we don't track.
 */
export type ParamChangeKind = "buff" | "nerf" | "neutral";

/**
 * Ordered substring rules describing whether a higher value of a parameter is good for its
 * weapon. The first rule whose `match` is a substring of the full `${category}.${key}` wins,
 * so narrower exceptions are listed before broader rules (e.g. `ReceiveDamage` before
 * `Damage`). Parameters matching no rule are treated as having an unknown direction.
 */
const PARAM_DIRECTION_RULES: Array<{
	match: string;
	betterWhenHigher: boolean;
}> = [
	// Taking less damage is good, so these override the broader "Damage" rule below.
	{ match: "ReceiveDamage", betterWhenHigher: false },
	{ match: "AttackedDamageRate", betterWhenHigher: false },

	// Lower is better: less ink, faster recovery, tighter spread, shorter delays.
	{ match: "InkConsume", betterWhenHigher: false },
	{ match: "InkRecoverStop", betterWhenHigher: false },
	{ match: "DegSwerve", betterWhenHigher: false },
	{ match: "DegBias", betterWhenHigher: false },
	{ match: "ChargeFrame", betterWhenHigher: false },
	{ match: "RepeatFrame", betterWhenHigher: false },
	{ match: "PostDelayFrame", betterWhenHigher: false },
	{ match: "PreDelayFrame", betterWhenHigher: false },
	{ match: "DashFrame", betterWhenHigher: false },
	{ match: "NakedFrame", betterWhenHigher: false },
	{ match: "Dash_ChargeCancelableFrame", betterWhenHigher: false},

	// Higher is better: more damage, durability, mobility, paint, range, uptime.
	{ match: "Damage", betterWhenHigher: true },
	{ match: "CanopyHP", betterWhenHigher: true },
	{ match: "ArmorHP", betterWhenHigher: true },
	{ match: "MaxFieldHP", betterWhenHigher: true },
	{ match: "MaxHP", betterWhenHigher: true },
	{ match: "HitPoint", betterWhenHigher: true },
	{ match: "MoveSpeed", betterWhenHigher: true },
	{ match: "WidthHalf", betterWhenHigher: true },
	{ match: "PaintRadius", betterWhenHigher: true },
	{ match: "CrossPaint", betterWhenHigher: true },
	{ match: "PaintHeight", betterWhenHigher: true },
	{ match: "SpawnNum", betterWhenHigher: true },
	{ match: "SplitNum", betterWhenHigher: true },
	{ match: "SpawnSpeed", betterWhenHigher: true },
	{ match: "GoStraightStateEndMaxSpeed", betterWhenHigher: true },
	{ match: "MaxShootingFrame", betterWhenHigher: true },
	{ match: "ServeAreaRadius", betterWhenHigher: true },
	{ match: "PowerUpFrame", betterWhenHigher: true },
	{ match: "KnockBackParam.Distance", betterWhenHigher: true },

	// Longer-lasting effects and uptime are buffs.
	{ match: "SpecialTotalFrame", betterWhenHigher: true },
	{ match: "SpecialDurationFrame", betterWhenHigher: true },
	{ match: "MarkingFrame", betterWhenHigher: true },
	{ match: "RainyFrame", betterWhenHigher: true },
	{ match: "LaserFrame", betterWhenHigher: true },
	{ match: ".Low", betterWhenHigher: true },
	{ match: ".Mid", betterWhenHigher: true },
	{ match: ".High", betterWhenHigher: true },
];

/**
 * Returns whether a higher value of the given parameter benefits the weapon's owner, using
 * substring matching against `${category}.${key}`. Returns `null` when the parameter is not
 * recognized as clearly directional.
 */
function getParamDirection(category: string, key: string): ParamDirection {
	const fullKey = `${category}.${key}`;

	for (const { match, betterWhenHigher } of PARAM_DIRECTION_RULES) {
		if (fullKey.includes(match)) {
			return betterWhenHigher ? "higher" : "lower";
		}
	}

	return null;
}

/**
 * Classifies a parameter value change between two patches as a buff, a nerf, or neutral.
 *
 * Neutral is returned for non-numeric values, unchanged values, or parameters whose impact
 * direction is unknown (see {@link getParamDirection}).
 */
export function classifyParamChange(
	category: string,
	key: string,
	from: number | string,
	to: number | string,
): ParamChangeKind {
	if (typeof from !== "number" || typeof to !== "number" || from === to) {
		return "neutral";
	}

	const direction = getParamDirection(category, key);
	if (direction === null) {
		return "neutral";
	}

	const increased = to > from;
	const improved = direction === "higher" ? increased : !increased;

	return improved ? "buff" : "nerf";
}
