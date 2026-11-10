import * as R from "remeda";
import { BROADCAST_INK_COLORS } from "../broadcast-constants";
import type { BroadcastInkColorKey, BroadcastInkRgb } from "../broadcast-types";

// over game starts of cast and POV VoDs the worse side of a read sat a median 2.3 off its pair and up to ~12 on dim
// captures, misreads (the sky behind splatted icons) 17+
/** CIEDE2000 distance either team's read may be off its pair's reference color, farther is a pair not known. */
const MAX_SIDE_DISTANCE = 12;
/**
 * How much closer (mean CIEDE2000 over both teams) the closest pair must be than the next for it to be picked:
 * Color Lock's yellow and purple read within ~1 of Yellow vs Dark Blue, as much as captures differ.
 */
const MIN_MARGIN = 1;

type Lab = [number, number, number];

const REFERENCES = BROADCAST_INK_COLORS.map((pair) => ({
	key: pair.key,
	isColorLock: pair.isColorLock,
	a: toLab(hexToRgb(pair.referenceA)),
	b: toLab(hexToRgb(pair.referenceB)),
}));

/**
 * The ink color pair of the two teams' colors read off the game's HUD, in either order, by their perceptual
 * (CIEDE2000) distance to how each pair renders there. `null` when no pair is close, e.g. a pair not in
 * {@link BROADCAST_INK_COLORS}, or when another pair is about as close, rather than guess.
 *
 * `previous` is the pair the broadcast showed last: Color Lock is the viewing console's setting, so after a Color
 * Lock pair the same one stays as long as the read fits it, and after any other pair Color Lock pairs are out.
 */
export function closestPair(
	inks: [BroadcastInkRgb, BroadcastInkRgb],
	previous: BroadcastInkColorKey | null,
): BroadcastInkColorKey | null {
	const [first, second] = inks.map(toLab) as [Lab, Lab];
	const ranked = REFERENCES.map((pair) => {
		const straight: [number, number] = [
			deltaE2000(first, pair.a),
			deltaE2000(second, pair.b),
		];
		const flipped: [number, number] = [
			deltaE2000(first, pair.b),
			deltaE2000(second, pair.a),
		];
		const sides = R.mean(straight) <= R.mean(flipped) ? straight : flipped;

		return {
			key: pair.key,
			isColorLock: pair.isColorLock,
			distance: R.mean(sides),
			worst: Math.max(...sides),
		};
	}).sort((a, b) => a.distance - b.distance);

	const previousPair = ranked.find((pair) => pair.key === previous);
	if (previousPair?.isColorLock && previousPair.worst <= MAX_SIDE_DISTANCE) {
		return previousPair.key;
	}

	const [closest, runnerUp] =
		previousPair && !previousPair.isColorLock
			? ranked.filter((pair) => !pair.isColorLock)
			: ranked;
	if (!closest || closest.worst > MAX_SIDE_DISTANCE) return null;
	if (runnerUp && runnerUp.distance - closest.distance < MIN_MARGIN) {
		return null;
	}

	return closest.key;
}

function hexToRgb(hex: string): BroadcastInkRgb {
	const [r, g, b] = [1, 3, 5].map((start) =>
		Number.parseInt(hex.slice(start, start + 2), 16),
	);

	return { r: r!, g: g!, b: b! };
}

/** sRGB to CIELAB under D65. */
function toLab({ r, g, b }: BroadcastInkRgb): Lab {
	const [red, green, blue] = [r, g, b].map((channel) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
	const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
	const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
	const f = (t: number) =>
		t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;

	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 color difference (Sharma, Wu & Dalal 2005). */
function deltaE2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab) {
	const radians = Math.PI / 180;
	const meanChroma = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
	const g =
		0.5 * (1 - Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)));
	const a1Prime = (1 + g) * a1;
	const a2Prime = (1 + g) * a2;
	const c1 = Math.hypot(a1Prime, b1);
	const c2 = Math.hypot(a2Prime, b2);
	const hue = (a: number, b: number) =>
		a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / radians + 360) % 360;
	const h1 = hue(a1Prime, b1);
	const h2 = hue(a2Prime, b2);

	let hueDelta = 0;
	if (c1 * c2 !== 0) {
		hueDelta = h2 - h1;
		if (hueDelta > 180) hueDelta -= 360;
		else if (hueDelta < -180) hueDelta += 360;
	}
	const bigHueDelta =
		2 * Math.sqrt(c1 * c2) * Math.sin((hueDelta / 2) * radians);

	const meanL = (l1 + l2) / 2;
	const meanC = (c1 + c2) / 2;
	let meanH = h1 + h2;
	if (c1 * c2 !== 0) {
		if (Math.abs(h1 - h2) > 180) meanH += h1 + h2 < 360 ? 360 : -360;
		meanH /= 2;
	}

	const t =
		1 -
		0.17 * Math.cos((meanH - 30) * radians) +
		0.24 * Math.cos(2 * meanH * radians) +
		0.32 * Math.cos((3 * meanH + 6) * radians) -
		0.2 * Math.cos((4 * meanH - 63) * radians);
	const rotation = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
	const rc = 2 * Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7));
	const sl =
		1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
	const sc = 1 + 0.045 * meanC;
	const sh = 1 + 0.015 * meanC * t;
	const rt = -Math.sin(2 * rotation * radians) * rc;
	const lightness = (l2 - l1) / sl;
	const chroma = (c2 - c1) / sc;
	const hueTerm = bigHueDelta / sh;

	return Math.sqrt(
		lightness ** 2 + chroma ** 2 + hueTerm ** 2 + rt * chroma * hueTerm,
	);
}
