import type * as v from "valibot";
import type { CustomTheme } from "~/db/tables-json";
import {
	contrastRatio,
	cuspLightness,
	maxChroma,
	type Oklch,
} from "~/utils/oklch-gamut";
import { THEME_INPUT_LIMITS, type themeInputSchema } from "~/utils/schema";

export type ThemeInput = v.InferOutput<typeof themeInputSchema>;

export const DEFAULT_THEME_INPUT: ThemeInput = {
	baseHue: 268,
	baseChroma: 0.05,
	accentHue: 253,
	accentChroma: 0.24,
	bgLightness: THEME_INPUT_LIMITS.BG_LIGHTNESS_DEFAULT,
	chatHue: null,
	radiusBox: 3,
	radiusField: 2,
	radiusSelector: 2,
	borderWidth: 2,
	sizeField: 1,
	sizeSelector: 1,
	sizeSpacing: 1,
};

/** WCAG AA for normal sized text */
const MIN_TEXT_CONTRAST = 4.5;
const LIGHTNESS_SEARCH_STEP = 0.005;

// Any changes to the lightness values or offsets NEED to be reflected in vars.css as well

const BASE_LIGHTNESS_VALUES = [
	1.0, // --_base-c-0
	0.95, // --_base-c-1
	0.9, // --_base-c-2
	0.64, // --_base-c-3
	0.46, // --_base-c-4
	0.32, // --_base-c-5
	0.25, // --_base-c-6
	0.17, // --_base-c-7
] as const;

const BASE_CHROMA_MULTIPLIERS = [
	0.01, 0.49, 0.62, 1.4, 1.29, 1.36, 1.29, 0.67,
] as const;

/** In dark mode --color-base-5...7 sit this much above the background lightness (`--_base-l`) */
const DARK_SURFACE_OFFSETS: Partial<Record<number, number>> = {
	5: 0.15,
	6: 0.08,
	7: 0,
};

/** Lightness of text drawn on top of accent fills when the fill is too light for white text */
const DARK_TEXT_LIGHTNESS = BASE_LIGHTNESS_VALUES[7];

interface AccentSlot {
	/** Lightness the slot is designed around, the solver only moves away from it when needed */
	lightness: number;
	chromaMultiplier: number;
	/** Hues that are at their most colorful above `lightness` (yellow, cyan...) are raised toward that point, at most up to this value, so they stay clean tints instead of muddy shades */
	maxCuspLift?: number;
}

const ACCENT_SLOTS = [
	{ lightness: 0.26, chromaMultiplier: 0.38 }, // dark --color-accent-low
	{ lightness: 0.52, chromaMultiplier: 1.11 }, // dark --color-accent
	{ lightness: 0.83, chromaMultiplier: 0.34, maxCuspLift: 0.92 }, // dark --color-accent-high
	{ lightness: 0.88, chromaMultiplier: 0.25, maxCuspLift: 0.92 }, // light --color-accent-low
	{ lightness: 0.53, chromaMultiplier: 1.09 }, // light --color-accent
	{ lightness: 0.32, chromaMultiplier: 0.56 }, // light --color-accent-high
] as const satisfies ReadonlyArray<AccentSlot>;

/** Light mode --color-fill-accent when it is swapped to a bright fill with dark text */
const BRIGHT_FILL = {
	minLightness: 0.8,
	maxLightness: 0.92,
	chromaMultiplier: 1.09,
	/** How much more chroma the bright fill has to reach before it is preferred over the dark one */
	minChromaGain: 1.25,
};

/**
 * Hues with a larger gamut than the default accent hue get proportionally more chroma
 * so e.g. yellow can be as vivid as blue is at the same slider value.
 */
const GAMUT_BOOST = {
	referenceHue: DEFAULT_THEME_INPUT.accentHue,
	max: 2,
};

/** Dark yellows look olive, so shades of them are rotated toward amber (like e.g. Tailwind's yellow palette does) */
const SHADE_HUE_SHIFT = {
	targetHue: 70,
	fullWeightHues: [85, 115],
	zeroWeightHues: [75, 135],
	strength: 0.85,
	/** How far below the hue's cusp lightness the full shift is applied */
	fullShiftDepth: 0.4,
};

/**
 * Expands the supporter's slider values into the CSS variables of a custom theme.
 * Every text color is solved to have at least WCAG AA contrast against the surfaces it's shown on.
 */
export function build(input: ThemeInput): CustomTheme {
	const bgLightness = input.bgLightness;
	const baseChromas = BASE_LIGHTNESS_VALUES.map((lightness, index) => {
		const desiredChroma = input.baseChroma * BASE_CHROMA_MULTIPLIERS[index];
		const darkSurfaceOffset = DARK_SURFACE_OFFSETS[index];
		const lightnesses =
			darkSurfaceOffset === undefined
				? [lightness]
				: [lightness, bgLightness + darkSurfaceOffset];

		return Math.min(
			desiredChroma,
			...lightnesses.map((l) => maxChroma(l, input.baseHue)),
		);
	});

	const surfaces: Surfaces = {
		dark: {
			bgHigher: {
				l: bgLightness + DARK_SURFACE_OFFSETS[5]!,
				c: baseChromas[5],
				h: input.baseHue,
			},
		},
		light: {
			bg: { l: BASE_LIGHTNESS_VALUES[0], c: baseChromas[0], h: input.baseHue },
			bgHigh: {
				l: BASE_LIGHTNESS_VALUES[1],
				c: baseChromas[1],
				h: input.baseHue,
			},
			darkText: {
				l: DARK_TEXT_LIGHTNESS,
				c: baseChromas[7],
				h: input.baseHue,
			},
		},
	};

	const accent = buildPalette({
		hue: input.accentHue,
		chroma: input.accentChroma,
		boostChroma: true,
		surfaces,
	});

	const secondaryHue = (input.accentHue + 180) % 360;
	const secondary = buildPalette({
		hue: secondaryHue,
		chroma: input.accentChroma,
		boostChroma: false,
		surfaces,
	});

	const lightFill = buildLightFill({
		hue: input.accentHue,
		chroma: input.accentChroma,
		darkFill: accent[4],
		darkText: surfaces.light.darkText,
	});

	return {
		"--_base-h": input.baseHue,
		"--_base-c-0": baseChromas[0],
		"--_base-c-1": baseChromas[1],
		"--_base-c-2": baseChromas[2],
		"--_base-c-3": baseChromas[3],
		"--_base-c-4": baseChromas[4],
		"--_base-c-5": baseChromas[5],
		"--_base-c-6": baseChromas[6],
		"--_base-c-7": baseChromas[7],
		"--_base-l": bgLightness,
		"--_acc-h": input.accentHue,
		"--_acc-c": input.accentChroma,
		...slotVars("acc", accent),
		"--_acc-l-6": lightFill.color.l,
		"--_acc-c-6": lightFill.color.c,
		"--_acc-h-6": lightFill.color.h,
		"--_acc-fill-dark-text": lightFill.hasDarkText ? 1 : 0,
		"--_second-h": secondaryHue,
		...slotVars("second", secondary),
		"--_chat-h": input.chatHue,
		"--_radius-box": input.radiusBox,
		"--_radius-field": input.radiusField,
		"--_radius-selector": input.radiusSelector,
		"--_border-width": input.borderWidth,
		"--_size-field": input.sizeField,
		"--_size-selector": input.sizeSelector,
		"--_size-spacing": input.sizeSpacing,
	};
}

/** Recovers the slider values a stored custom theme was built from. */
export function toThemeInput(theme: CustomTheme): ThemeInput {
	return {
		baseHue: theme["--_base-h"] ?? DEFAULT_THEME_INPUT.baseHue,
		baseChroma:
			typeof theme["--_base-c-2"] === "number"
				? theme["--_base-c-2"] / BASE_CHROMA_MULTIPLIERS[2]
				: DEFAULT_THEME_INPUT.baseChroma,
		accentHue: theme["--_acc-h"] ?? DEFAULT_THEME_INPUT.accentHue,
		accentChroma: theme["--_acc-c"] ?? DEFAULT_THEME_INPUT.accentChroma,
		bgLightness: theme["--_base-l"] ?? DEFAULT_THEME_INPUT.bgLightness,
		chatHue: theme["--_chat-h"],
		radiusBox: theme["--_radius-box"] ?? DEFAULT_THEME_INPUT.radiusBox,
		radiusField: theme["--_radius-field"] ?? DEFAULT_THEME_INPUT.radiusField,
		radiusSelector:
			theme["--_radius-selector"] ?? DEFAULT_THEME_INPUT.radiusSelector,
		borderWidth: theme["--_border-width"] ?? DEFAULT_THEME_INPUT.borderWidth,
		sizeField: theme["--_size-field"] ?? DEFAULT_THEME_INPUT.sizeField,
		sizeSelector: theme["--_size-selector"] ?? DEFAULT_THEME_INPUT.sizeSelector,
		sizeSpacing: theme["--_size-spacing"] ?? DEFAULT_THEME_INPUT.sizeSpacing,
	};
}

/**
 * Every color of a built theme as vars.css resolves them, for verifying the accessibility and gamut guarantees.
 */
export function resolveColors(theme: CustomTheme) {
	const base = (lightness: number, chromaIndex: number): Oklch => ({
		l: lightness,
		c: theme[`--_base-c-${chromaIndex}` as "--_base-c-0"],
		h: theme["--_base-h"],
	});
	const slot = (prefix: "acc" | "second", index: number): Oklch => ({
		l: theme[`--_${prefix}-l-${index}` as "--_acc-l-0"],
		c: theme[`--_${prefix}-c-${index}` as "--_acc-c-0"],
		h: theme[`--_${prefix}-h-${index}` as "--_acc-h-0"],
	});
	const lightBase = BASE_LIGHTNESS_VALUES.map((lightness, index) =>
		base(lightness, index),
	);

	return {
		/** light mode lightnesses, also used as dark mode text colors */
		base: lightBase,
		dark: {
			bg: base(theme["--_base-l"], 7),
			bgHigh: base(theme["--_base-l"] + DARK_SURFACE_OFFSETS[6]!, 6),
			bgHigher: base(theme["--_base-l"] + DARK_SURFACE_OFFSETS[5]!, 5),
			text: lightBase[0],
			textHigh: lightBase[3],
			accentLow: slot("acc", 0),
			accent: slot("acc", 1),
			accentHigh: slot("acc", 2),
			secondLow: slot("second", 0),
			second: slot("second", 1),
			secondHigh: slot("second", 2),
		},
		light: {
			bg: lightBase[0],
			bgHigh: lightBase[1],
			bgHigher: lightBase[2],
			textHigh: lightBase[4],
			text: lightBase[7],
			accentLow: slot("acc", 3),
			accent: slot("acc", 4),
			accentHigh: slot("acc", 5),
			fillAccent: slot("acc", 6),
			textOnAccent:
				theme["--_acc-fill-dark-text"] === 1 ? lightBase[7] : lightBase[0],
			secondLow: slot("second", 3),
			second: slot("second", 4),
			secondHigh: slot("second", 5),
		},
	};
}

/**
 * Text/background color pairs of a built theme as vars.css resolves them, for verifying the accessibility guarantee.
 */
export function textContrastPairs(theme: CustomTheme) {
	const { dark, light } = resolveColors(theme);

	return [
		{ name: "dark text", fg: dark.text, bg: dark.bgHigher },
		{ name: "dark text-high", fg: dark.textHigh, bg: dark.bgHigh },
		{ name: "dark text-accent", fg: dark.accentHigh, bg: dark.bgHigher },
		{
			name: "dark text-accent on low",
			fg: dark.accentHigh,
			bg: dark.accentLow,
		},
		{ name: "dark text-on-accent", fg: dark.bg, bg: dark.accentHigh },
		{ name: "dark text-second", fg: dark.secondHigh, bg: dark.bgHigher },
		{
			name: "dark text-second on low",
			fg: dark.secondHigh,
			bg: dark.secondLow,
		},
		{ name: "light text", fg: light.text, bg: light.bgHigh },
		{ name: "light text-high", fg: light.textHigh, bg: light.bg },
		{ name: "light text-accent", fg: light.accent, bg: light.bgHigh },
		{
			name: "light accent-high on low",
			fg: light.accentHigh,
			bg: light.accentLow,
		},
		{
			name: "light text-on-accent",
			fg: light.textOnAccent,
			bg: light.fillAccent,
		},
		{ name: "light text-second", fg: light.second, bg: light.bgHigh },
		{
			name: "light second-high on low",
			fg: light.secondHigh,
			bg: light.secondLow,
		},
	].map((pair) => ({ ...pair, contrast: contrastRatio(pair.fg, pair.bg) }));
}

interface Surfaces {
	dark: { bgHigher: Oklch };
	light: { bg: Oklch; bgHigh: Oklch; darkText: Oklch };
}

function buildPalette({
	hue,
	chroma,
	boostChroma,
	surfaces,
}: {
	hue: number;
	chroma: number;
	boostChroma: boolean;
	surfaces: Surfaces;
}): Oklch[] {
	const colorAt = (slot: AccentSlot) => (lightness: number) =>
		slotColor({
			lightness,
			hue,
			desiredChroma: chroma * slot.chromaMultiplier,
			boostChroma,
		});
	const startLightness = (slot: AccentSlot) =>
		slot.maxCuspLift
			? clamp(cuspLightness(hue), slot.lightness, slot.maxCuspLift)
			: slot.lightness;

	const [darkLow, darkMid, darkHigh, lightLow, lightMid, lightHigh] =
		ACCENT_SLOTS.map((slot) => colorAt(slot)(startLightness(slot)));

	return [
		darkLow,
		darkMid,
		ensureContrast({
			colorAt: colorAt(ACCENT_SLOTS[2]),
			start: darkHigh,
			against: [surfaces.dark.bgHigher, darkLow],
			direction: "lighter",
		}),
		lightLow,
		ensureContrast({
			colorAt: colorAt(ACCENT_SLOTS[4]),
			start: lightMid,
			against: [surfaces.light.bg, surfaces.light.bgHigh],
			direction: "darker",
		}),
		ensureContrast({
			colorAt: colorAt(ACCENT_SLOTS[5]),
			start: lightHigh,
			against: [lightLow],
			direction: "darker",
		}),
	];
}

/** Light mode fill (buttons, badges...), a bright fill with dark text is used when the hue can't be vivid while dark */
function buildLightFill({
	hue,
	chroma,
	darkFill,
	darkText,
}: {
	hue: number;
	chroma: number;
	darkFill: Oklch;
	darkText: Oklch;
}) {
	const colorAt = (lightness: number) =>
		slotColor({
			lightness,
			hue,
			desiredChroma: chroma * BRIGHT_FILL.chromaMultiplier,
			boostChroma: true,
		});
	const brightFill = ensureContrast({
		colorAt,
		start: colorAt(
			clamp(
				cuspLightness(hue),
				BRIGHT_FILL.minLightness,
				BRIGHT_FILL.maxLightness,
			),
		),
		against: [darkText],
		direction: "lighter",
	});

	if (brightFill.c > darkFill.c * BRIGHT_FILL.minChromaGain) {
		return { color: brightFill, hasDarkText: true };
	}

	return { color: darkFill, hasDarkText: false };
}

function slotColor({
	lightness,
	hue,
	desiredChroma,
	boostChroma,
}: {
	lightness: number;
	hue: number;
	desiredChroma: number;
	boostChroma: boolean;
}): Oklch {
	// rounded before the gamut is computed so the stored values are exactly the checked ones
	const roundedLightness = round(lightness);
	const shiftedHue = round(shadeShiftedHue(hue, roundedLightness));
	const gamut = maxChroma(roundedLightness, shiftedHue);
	const boost = boostChroma ? gamutBoost(roundedLightness, gamut) : 1;

	return {
		l: roundedLightness,
		c: Math.min(desiredChroma * boost, gamut),
		h: shiftedHue,
	};
}

function gamutBoost(lightness: number, gamut: number) {
	const referenceGamut = maxChroma(lightness, GAMUT_BOOST.referenceHue);
	if (referenceGamut <= 0) return 1;

	return clamp(gamut / referenceGamut, 1, GAMUT_BOOST.max);
}

function shadeShiftedHue(hue: number, lightness: number) {
	const weight = yellowWeight(hue);
	if (weight === 0) return hue;

	const depth = clamp(
		(cuspLightness(hue) - lightness) / SHADE_HUE_SHIFT.fullShiftDepth,
		0,
		1,
	);

	return (
		hue +
		(SHADE_HUE_SHIFT.targetHue - hue) *
			weight *
			depth *
			SHADE_HUE_SHIFT.strength
	);
}

function yellowWeight(hue: number) {
	const [fullStart, fullEnd] = SHADE_HUE_SHIFT.fullWeightHues;
	const [zeroStart, zeroEnd] = SHADE_HUE_SHIFT.zeroWeightHues;

	if (hue <= zeroStart || hue >= zeroEnd) return 0;
	if (hue < fullStart) return (hue - zeroStart) / (fullStart - zeroStart);
	if (hue > fullEnd) return (zeroEnd - hue) / (zeroEnd - fullEnd);
	return 1;
}

/** Moves the color's lightness until it has enough contrast against every given color */
function ensureContrast({
	colorAt,
	start,
	against,
	direction,
}: {
	colorAt: (lightness: number) => Oklch;
	start: Oklch;
	against: Oklch[];
	direction: "lighter" | "darker";
}): Oklch {
	const step =
		direction === "lighter" ? LIGHTNESS_SEARCH_STEP : -LIGHTNESS_SEARCH_STEP;
	const hasContrast = (candidate: Oklch) =>
		against.every(
			(other) => contrastRatio(candidate, other) >= MIN_TEXT_CONTRAST,
		);

	let color = start;
	while (!hasContrast(color)) {
		const nextLightness = color.l + step;
		if (nextLightness < 0 || nextLightness > 1) {
			return colorAt(direction === "lighter" ? 1 : 0);
		}
		color = colorAt(nextLightness);
	}

	return color;
}

type SlotVars<Prefix extends string> = Record<
	`--_${Prefix}-${"l" | "c" | "h"}-${0 | 1 | 2 | 3 | 4 | 5}`,
	number
>;

function slotVars<Prefix extends "acc" | "second">(
	prefix: Prefix,
	slots: Oklch[],
): SlotVars<Prefix> {
	const result: Record<string, number> = {};
	for (const [index, color] of slots.entries()) {
		result[`--_${prefix}-l-${index}`] = color.l;
		result[`--_${prefix}-c-${index}`] = color.c;
		result[`--_${prefix}-h-${index}`] = color.h;
	}

	return result as SlotVars<Prefix>;
}

function round(value: number) {
	return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}
