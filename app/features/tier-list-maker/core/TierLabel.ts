/**
 * How a tier's label is drawn: its name shrinking to fit the fixed-width label and its text
 * staying readable on whatever color the user picked. Shared by the editor and the exported image.
 */

const FONT_SIZE_BREAKPOINTS = [
	{ maxLength: 3, fontSize: "var(--font-xl)" },
	{ maxLength: 8, fontSize: "var(--font-lg)" },
	{ maxLength: 15, fontSize: "var(--font-md)" },
	{ maxLength: 25, fontSize: "var(--font-sm)" },
	{ maxLength: 35, fontSize: "var(--font-xs)" },
] as const;

const FONT_SIZE_MIN = "var(--font-2xs)";

const LIGHT_COLOR_LUMINANCE_THRESHOLD = 0.5;

/** Font size (a CSS variable) of the tier's name, smaller the longer the name is. */
export function fontSize(name: string) {
	for (const breakpoint of FONT_SIZE_BREAKPOINTS) {
		if (name.length <= breakpoint.maxLength) {
			return breakpoint.fontSize;
		}
	}

	return FONT_SIZE_MIN;
}

/** Whether dark text and icons read better on the given `#rgb` or `#rrggbb` color than light ones. */
export function isLightColor(hex: string) {
	const channels = hexChannels(hex);
	if (!channels) return false;

	const [r, g, b] = channels;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > LIGHT_COLOR_LUMINANCE_THRESHOLD;
}

/** Text color (a CSS variable) that stays readable on a tier's `#rgb` or `#rrggbb` background color. */
export function textColor(hex: string) {
	return isLightColor(hex)
		? "var(--color-text-on-light)"
		: "var(--color-text-on-dark)";
}

function hexChannels(hex: string) {
	const digits = hex.replace("#", "");
	const channels =
		digits.length === 3
			? digits.split("").map((digit) => `${digit}${digit}`)
			: digits.match(/.{2}/g);

	if (!channels || channels.length < 3) return null;

	const parsed = channels
		.slice(0, 3)
		.map((channel) => Number.parseInt(channel, 16));

	return parsed.some(Number.isNaN) ? null : parsed;
}
