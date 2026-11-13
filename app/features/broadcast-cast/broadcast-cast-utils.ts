import type { Pronouns } from "~/db/tables-json";
import type { BroadcastObjectiveRead } from "~/features/broadcast/broadcast-types";
import type { BROADCAST_SCENE_PARTS } from "./broadcast-cast-constants";
import type { CastProducerState, CastScene } from "./broadcast-cast-types";

/** Builds the scene's `data-part` attributes, only allowing the parts documented in {@link BROADCAST_SCENE_PARTS}. */
export const scenePart =
	<S extends keyof typeof BROADCAST_SCENE_PARTS>(_scene: S) =>
	(name: (typeof BROADCAST_SCENE_PARTS)[S][number]) => ({
		"data-part": name,
	});

/** Pronouns as shown next to a name, e.g. "he/him". */
export function pronounsLabel(pronouns: Pronouns) {
	return `${pronouns.subject}/${pronouns.object}`;
}

/**
 * Share of the game (0-1) each team held the objective, in the reads' team order. A read's control lasts until the
 * next read, the time neither held it is left out of both.
 */
export function controlShares(
	events: readonly BroadcastObjectiveRead[],
): [number, number] {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const duration = (sorted.at(-1)?.t ?? 0) - (sorted[0]?.t ?? 0);
	const held: [number, number] = [0, 0];
	if (duration <= 0) return held;

	for (let i = 0; i < sorted.length - 1; i++) {
		const control = sorted[i]!.control;
		if (control === null) continue;

		held[control] += sorted[i + 1]!.t - sorted[i]!.t;
	}

	return [held[0] / duration, held[1] / duration];
}

/**
 * Whether the scene shows the featured match's teams (rosters, maps and results), having nothing to show without a
 * match cast on the channel. The team scene does only when it follows one of the match's sides (`teamPick`), any other team it shows on its own.
 */
export function needsFeaturedMatch(
	scene: CastScene,
	teamPick?: CastProducerState["teamPick"],
) {
	if (scene === "team") {
		return teamPick === "left" || teamPick === "right";
	}

	return scene === "rosters" || scene === "maps" || scene === "results";
}

/**
 * SVG path data of a smooth line through the points (in x order): points closer than `tolerance` to the line
 * through their neighbors are left out (Ramer–Douglas–Peucker), which evens out the small steps between reads,
 * and the rest are joined with a monotone cubic curve, which never overshoots a point (a falling count never
 * rises between reads). Empty without points.
 */
export function smoothLinePath(
	points: ReadonlyArray<{ x: number; y: number }>,
	tolerance: number,
) {
	const kept = simplified(points, tolerance);
	const [first] = kept;
	if (!first) return "";

	const tangents = monotoneTangents(kept);
	const segments = kept.slice(1).map((point, i) => {
		const from = kept[i]!;
		const third = (point.x - from.x) / 3;

		return `C${from.x + third},${from.y + tangents[i]! * third} ${point.x - third},${point.y - tangents[i + 1]! * third} ${point.x},${point.y}`;
	});

	return [`M${first.x},${first.y}`, ...segments].join(" ");
}

function simplified(
	points: ReadonlyArray<{ x: number; y: number }>,
	tolerance: number,
): Array<{ x: number; y: number }> {
	if (points.length < 3) return [...points];

	const first = points[0]!;
	const last = points.at(-1)!;
	let farthestIdx = 0;
	let farthest = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const distance = distanceToLine(points[i]!, first, last);
		if (distance > farthest) {
			farthest = distance;
			farthestIdx = i;
		}
	}
	if (farthest <= tolerance) return [first, last];

	return [
		...simplified(points.slice(0, farthestIdx + 1), tolerance).slice(0, -1),
		...simplified(points.slice(farthestIdx), tolerance),
	];
}

function distanceToLine(
	point: { x: number; y: number },
	start: { x: number; y: number },
	end: { x: number; y: number },
) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy);
	if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);

	return (
		Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) /
		length
	);
}

/** Slope of the curve at each point (Fritsch–Carlson): flat at a point where the line turns, so it can't overshoot. */
function monotoneTangents(points: ReadonlyArray<{ x: number; y: number }>) {
	const slopes = points.slice(1).map((point, i) => {
		const dx = point.x - points[i]!.x;
		return dx === 0 ? 0 : (point.y - points[i]!.y) / dx;
	});

	return points.map((_, i) => {
		const before = slopes[i - 1];
		const after = slopes[i];
		if (before === undefined) return after ?? 0;
		if (after === undefined) return before;
		if (before * after <= 0) return 0;

		const dxBefore = points[i]!.x - points[i - 1]!.x;
		const dxAfter = points[i + 1]!.x - points[i]!.x;
		const weighted =
			(before * dxAfter + after * dxBefore) / (dxBefore + dxAfter);

		return (
			Math.sign(before) *
			Math.min(2 * Math.abs(before), 2 * Math.abs(after), Math.abs(weighted))
		);
	});
}
