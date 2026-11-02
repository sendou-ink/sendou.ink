import { BROADCAST_INK_COLORS } from "../broadcast-constants";
import type { BroadcastInkColorKey } from "../broadcast-types";

// the game's ink renders lighter or darker than the pairs' colors, so only the hue is compared
const MAX_HUE_DISTANCE_SUM = 40;

/**
 * The ink color pair closest to the two teams' hues (degrees) read off the game, in either order. `null` when no
 * pair is close, e.g. hues of a pair not in {@link BROADCAST_INK_COLORS}.
 */
export function closestPair([first, second]: [
	number,
	number,
]): BroadcastInkColorKey | null {
	let closest: { key: BroadcastInkColorKey; distance: number } | null = null;
	for (const pair of BROADCAST_INK_COLORS) {
		const a = hueOf(hexToRgb(pair.a));
		const b = hueOf(hexToRgb(pair.b));
		const distance = Math.min(
			hueDistance(first, a) + hueDistance(second, b),
			hueDistance(first, b) + hueDistance(second, a),
		);

		if (!closest || distance < closest.distance) {
			closest = { key: pair.key, distance };
		}
	}

	return closest && closest.distance <= MAX_HUE_DISTANCE_SUM
		? closest.key
		: null;
}

function hexToRgb(hex: string) {
	const [r, g, b] = [1, 3, 5].map((start) =>
		Number.parseInt(hex.slice(start, start + 2), 16),
	);

	return { r: r!, g: g!, b: b! };
}

function hueOf({ r, g, b }: { r: number; g: number; b: number }) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (max === min) return 0;

	const delta = max - min;
	const sector =
		max === r
			? ((g - b) / delta) % 6
			: max === g
				? (b - r) / delta + 2
				: (r - g) / delta + 4;

	return (sector * 60 + 360) % 360;
}

function hueDistance(a: number, b: number) {
	const distance = Math.abs(a - b) % 360;

	return distance > 180 ? 360 - distance : distance;
}
