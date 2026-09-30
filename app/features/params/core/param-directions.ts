/** Whether a higher value is better or worse for the weapon's owner; `null` = unknown / context-dependent. */
type ParamDirection = "higher" | "lower" | null;

/** `"neutral"` = unclassified parameter or a change whose direction isn't tracked. */
export type ParamChangeKind = "buff" | "nerf" | "neutral";

/**
 * First rule whose `match` is a substring of `${category}.${key}` wins, so narrower exceptions go
 * before broader rules (`ReceiveDamage` before `Damage`). No match = unknown direction.
 */
const PARAM_DIRECTION_RULES: Array<{
	match: string;
	betterWhenHigher: boolean;
}> = [
	// overrides the broader "Damage" rule below
	{ match: "ReceiveDamage", betterWhenHigher: false },
	{ match: "AttackedDamageRate", betterWhenHigher: false },

	// lower is better
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
	{ match: "Dash_ChargeCancelableFrame", betterWhenHigher: false },

	// higher is better
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

	{ match: "SpecialTotalFrame", betterWhenHigher: true },
	{ match: "SpecialDurationFrame", betterWhenHigher: true },
	{ match: "MarkingFrame", betterWhenHigher: true },
	{ match: "RainyFrame", betterWhenHigher: true },
	{ match: "LaserFrame", betterWhenHigher: true },
	{ match: ".Low", betterWhenHigher: true },
	{ match: ".Mid", betterWhenHigher: true },
	{ match: ".High", betterWhenHigher: true },
];

function getParamDirection(category: string, key: string): ParamDirection {
	const fullKey = `${category}.${key}`;

	for (const { match, betterWhenHigher } of PARAM_DIRECTION_RULES) {
		if (fullKey.includes(match)) {
			return betterWhenHigher ? "higher" : "lower";
		}
	}

	return null;
}

const DAMAGE_BREAKPOINT_PATTERN = /^\s*([\d.]+)\s*@\s*([\d.]+)\s*$/;

/** Inverse of `formatDistanceDamageArray`; `null` for any other string (enums, primitive-array blobs). */
function parseDamageCurve(
	value: number | string,
): Array<{ damage: number; distance: number }> | null {
	if (typeof value !== "string") {
		return null;
	}

	const breakpoints: Array<{ damage: number; distance: number }> = [];
	for (const part of value.split(",")) {
		const match = part.match(DAMAGE_BREAKPOINT_PATTERN);
		if (!match) return null;
		breakpoints.push({ damage: Number(match[1]), distance: Number(match[2]) });
	}

	return breakpoints.length > 0 ? breakpoints : null;
}

/**
 * Breakpoint by breakpoint; more damage and more reach both count as improvements. All improve = buff,
 * all worsen = nerf, mixed or differing shape = neutral. `null` when not both curves.
 */
function classifyDamageCurveChange(
	direction: ParamDirection,
	from: number | string,
	to: number | string,
): ParamChangeKind | null {
	const fromCurve = parseDamageCurve(from);
	const toCurve = parseDamageCurve(to);
	if (!fromCurve || !toCurve || fromCurve.length !== toCurve.length) {
		return null;
	}

	let improved = false;
	let worsened = false;
	for (let i = 0; i < fromCurve.length; i++) {
		for (const field of ["damage", "distance"] as const) {
			const before = fromCurve[i][field];
			const after = toCurve[i][field];
			if (before === after) continue;
			const isImprovement =
				direction === "lower" ? after < before : after > before;
			if (isImprovement) {
				improved = true;
			} else {
				worsened = true;
			}
		}
	}

	if (improved && !worsened) return "buff";
	if (worsened && !improved) return "nerf";
	return "neutral";
}

/**
 * Buff, nerf or neutral. Falloff curves go through {@link classifyDamageCurveChange}; other non-numeric,
 * unchanged or unknown-direction ({@link getParamDirection}) values are neutral.
 */
export function classifyParamChange(
	category: string,
	key: string,
	from: number | string,
	to: number | string,
): ParamChangeKind {
	const direction = getParamDirection(category, key);
	if (direction === null) {
		return "neutral";
	}

	const curveChange = classifyDamageCurveChange(direction, from, to);
	if (curveChange !== null) {
		return curveChange;
	}

	if (typeof from !== "number" || typeof to !== "number" || from === to) {
		return "neutral";
	}

	const increased = to > from;
	const improved = direction === "higher" ? increased : !increased;

	return improved ? "buff" : "nerf";
}
