/**
 * What the tournament montage draws over its 1920×1080 frames: the
 * pre-rendered cards (entering with a fade and a slight settle, a moving
 * wave along their bottom, their items revealed one by one —
 * `REVEAL_TIMINGS`) and, on a clip, its ribbon on frosted glass (for
 * `RIBBON_SECONDS`) and the fast-forward badge.
 */

export const MONTAGE_WIDTH = 1920;
export const MONTAGE_HEIGHT = 1080;

const CARD_FADE_SECONDS = 0.5;
const CARD_SETTLE_SECONDS = 1.2;
const CARD_SETTLE_ZOOM = 0.03;
/** the band along a card's bottom the wave moves in */
export const CARD_WAVE_HEIGHT = 216;
/** back to front; each layer's crest line is the sum of its sines, drifting at `speed` px/s */
const CARD_WAVE_LAYERS = [
	{
		color: "oklch(42% 0.15 253)",
		base: 70,
		sines: [
			{ amplitude: 22, length: 900, speed: 60 },
			{ amplitude: 10, length: 430, speed: -35 },
		],
	},
	{
		color: "oklch(54% 0.18 253)",
		base: 115,
		sines: [
			{ amplitude: 18, length: 700, speed: -80 },
			{ amplitude: 8, length: 380, speed: 45 },
		],
	},
	{
		color: "oklch(66% 0.17 253)",
		base: 160,
		sines: [
			{ amplitude: 14, length: 1100, speed: 110 },
			{ amplitude: 7, length: 300, speed: -50 },
		],
	},
] as const;
const CARD_WAVE_STEP_PX = 8;
/**
 * How a card's items come in: `pop` grows each from its center (the intro's
 * team avatars, from the top left to the bottom right), `rise` fades each
 * in while sliding up (a team card's roster, in reading order). The first
 * item starts `start` seconds into the card, the last one `spread` later,
 * each taking `item`.
 */
export const REVEAL_TIMINGS = {
	pop: { start: 0.4, spread: 1.6, item: 0.5 },
	rise: { start: 0.5, spread: 0.6, item: 0.5 },
} as const;
export const REVEAL_RISE_PX = 40;
const RIBBON_SECONDS = 5;
const RIBBON_FADE_SECONDS = 0.4;
const RIBBON_RISE_PX = 24;
export const RIBBON_MARGIN_PX = 40;
/** the frosted glass the ribbon's content sits on, in output px */
export const RIBBON_GLASS = {
	blur: 28,
	radius: 32,
	tint: "oklch(17% 0.03 268 / 0.55)",
	border: "oklch(100% 0 0 / 0.16)",
	borderWidth: 2,
} as const;

type Context = OffscreenCanvasRenderingContext2D;
type AnyContext = Context | CanvasRenderingContext2D;

/** Where a revealed item sits on the card, in fractions of its width and height. */
export interface CardRevealRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type RevealStyle = keyof typeof REVEAL_TIMINGS;

/** Items revealed over a card: cut from `image` (the card with them shown) at `rects`, in DOM order. */
export interface CardReveal {
	style: RevealStyle;
	image: ImageBitmap;
	rects: CardRevealRect[];
}

/** A full-frame card `t` seconds into its `seconds` on screen, its `reveal` items coming in over it. */
export function drawCard(
	ctx: Context,
	card: ImageBitmap,
	{ t, seconds, reveal }: { t: number; seconds: number; reveal?: CardReveal },
): void {
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, MONTAGE_WIDTH, MONTAGE_HEIGHT);
	const zoom =
		1 + CARD_SETTLE_ZOOM * (1 - easeOut(Math.min(1, t / CARD_SETTLE_SECONDS)));
	ctx.save();
	ctx.globalAlpha = Math.min(
		1,
		Math.max(0, Math.min(t, seconds - t) / CARD_FADE_SECONDS),
	);
	ctx.save();
	ctx.translate(MONTAGE_WIDTH / 2, MONTAGE_HEIGHT / 2);
	ctx.scale(zoom, zoom);
	ctx.translate(-MONTAGE_WIDTH / 2, -MONTAGE_HEIGHT / 2);
	ctx.drawImage(card, 0, 0, MONTAGE_WIDTH, MONTAGE_HEIGHT);
	if (reveal) drawReveal(ctx, reveal, t);
	ctx.restore();
	drawCardWave(ctx, t, MONTAGE_HEIGHT - CARD_WAVE_HEIGHT);
	ctx.restore();
}

/**
 * Each item's place in the reveal, 0 (first) to 1 (last): `pop` along the
 * diagonal from the top left to the bottom right by their centers, `rise`
 * in the order given. Rects in any one unit for both axes.
 */
export function revealOrder(
	style: RevealStyle,
	rects: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
): number[] {
	if (style === "rise") return riseOrder(rects.length);
	const sums = rects.map(
		(rect) => rect.x + rect.width / 2 + rect.y + rect.height / 2,
	);
	const min = Math.min(...sums);
	const span = Math.max(...sums) - min;
	return sums.map((sum) => (span > 0 ? (sum - min) / span : 0));
}

/** `count` items' places in a `rise` reveal, evenly spaced from 0 (first) to 1 (last). */
export function riseOrder(count: number): number[] {
	return Array.from({ length: count }, (_, i) =>
		count > 1 ? i / (count - 1) : 0,
	);
}

/** How far the item at `order` has come in `t` seconds into the card, 0 to 1. */
function revealProgress(style: RevealStyle, t: number, order: number): number {
	const timing = REVEAL_TIMINGS[style];
	return Math.min(
		1,
		Math.max(0, (t - timing.start - order * timing.spread) / timing.item),
	);
}

function drawReveal(ctx: Context, reveal: CardReveal, t: number): void {
	const { image, style } = reveal;
	const rects = reveal.rects.map((rect) => ({
		x: rect.x * MONTAGE_WIDTH,
		y: rect.y * MONTAGE_HEIGHT,
		width: rect.width * MONTAGE_WIDTH,
		height: rect.height * MONTAGE_HEIGHT,
		source: rect,
	}));
	const orders = revealOrder(style, rects);
	for (const [i, rect] of rects.entries()) {
		const progress = revealProgress(style, t, orders[i]!);
		if (progress === 0) continue;
		const scale = style === "pop" ? easeOutBack(progress) : 1;
		const width = rect.width * scale;
		const height = rect.height * scale;
		const x = rect.x + (rect.width - width) / 2;
		const y =
			rect.y +
			(rect.height - height) / 2 +
			(style === "rise" ? (1 - easeOut(progress)) * REVEAL_RISE_PX : 0);
		ctx.save();
		if (style === "rise") ctx.globalAlpha *= easeOut(progress);
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, Math.min(width, height) / 2);
		ctx.clip();
		ctx.drawImage(
			image,
			rect.source.x * image.width,
			rect.source.y * image.height,
			rect.source.width * image.width,
			rect.source.height * image.height,
			x,
			y,
			width,
			height,
		);
		ctx.restore();
	}
}

/** The card's wave `t` seconds in, `CARD_WAVE_HEIGHT` tall from `top`, across the frame's width. */
export function drawCardWave(ctx: AnyContext, t: number, top: number): void {
	const bottom = top + CARD_WAVE_HEIGHT;
	for (const layer of CARD_WAVE_LAYERS) {
		ctx.fillStyle = layer.color;
		ctx.beginPath();
		ctx.moveTo(0, bottom);
		for (let x = 0; x <= MONTAGE_WIDTH; x += CARD_WAVE_STEP_PX) {
			const crest = layer.sines.reduce<number>(
				(sum, sine) =>
					sum +
					sine.amplitude *
						Math.sin((2 * Math.PI * (x + sine.speed * t)) / sine.length),
				layer.base,
			);
			ctx.lineTo(x, top + crest);
		}
		ctx.lineTo(MONTAGE_WIDTH, bottom);
		ctx.closePath();
		ctx.fill();
	}
}

/**
 * The clip's ribbon (its content on a transparent background), bottom
 * center, `t` seconds into the clip, on frosted glass: the frame behind it
 * blurred and tinted. Gone after `RIBBON_SECONDS`.
 */
export function drawRibbon(ctx: Context, ribbon: ImageBitmap, t: number): void {
	if (t >= RIBBON_SECONDS) return;
	const fadeIn = Math.min(1, t / RIBBON_FADE_SECONDS);
	const fadeOut = Math.min(1, (RIBBON_SECONDS - t) / RIBBON_FADE_SECONDS);
	const x = (MONTAGE_WIDTH - ribbon.width) / 2;
	const y =
		MONTAGE_HEIGHT -
		ribbon.height -
		RIBBON_MARGIN_PX +
		(1 - easeOut(fadeIn)) * RIBBON_RISE_PX;
	ctx.save();
	ctx.globalAlpha = Math.min(fadeIn, fadeOut);
	ctx.beginPath();
	ctx.roundRect(x, y, ribbon.width, ribbon.height, RIBBON_GLASS.radius);
	ctx.save();
	ctx.clip();
	drawBlurred(ctx, { x, y, width: ribbon.width, height: ribbon.height });
	ctx.fillStyle = RIBBON_GLASS.tint;
	ctx.fillRect(x, y, ribbon.width, ribbon.height);
	ctx.drawImage(ribbon, x, y);
	ctx.restore();
	ctx.strokeStyle = RIBBON_GLASS.border;
	ctx.lineWidth = RIBBON_GLASS.borderWidth;
	ctx.stroke();
	ctx.restore();
}

let blurScratch: OffscreenCanvas | null = null;

/** The canvas's own pixels around the area drawn back over it blurred (a canvas can't filter itself in place). */
function drawBlurred(
	ctx: Context,
	area: { x: number; y: number; width: number; height: number },
): void {
	const pad = RIBBON_GLASS.blur * 2;
	const x = Math.max(0, Math.floor(area.x - pad));
	const y = Math.max(0, Math.floor(area.y - pad));
	const width =
		Math.min(MONTAGE_WIDTH, Math.ceil(area.x + area.width + pad)) - x;
	const height =
		Math.min(MONTAGE_HEIGHT, Math.ceil(area.y + area.height + pad)) - y;
	if (
		!blurScratch ||
		blurScratch.width < width ||
		blurScratch.height < height
	) {
		blurScratch = new OffscreenCanvas(width, height);
	}
	const scratch = blurScratch.getContext("2d")!;
	scratch.clearRect(0, 0, width, height);
	scratch.drawImage(ctx.canvas, x, y, width, height, 0, 0, width, height);
	ctx.filter = `blur(${RIBBON_GLASS.blur}px)`;
	ctx.drawImage(blurScratch, 0, 0, width, height, x, y, width, height);
	ctx.filter = "none";
}

/** `▶▶ 4×` on the right, under the special gauge, while dead time is fast-forwarded. */
export function drawFastForwardBadge(ctx: Context, speed: number): void {
	const width = 190;
	const height = 84;
	const x = MONTAGE_WIDTH - width - 48;
	const y = 260;
	ctx.fillStyle = "rgb(0 0 0 / 0.6)";
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, 20);
	ctx.fill();
	ctx.fillStyle = "#fff";
	for (const offset of [0, 30]) {
		ctx.beginPath();
		ctx.moveTo(x + 28 + offset, y + 22);
		ctx.lineTo(x + 58 + offset, y + height / 2);
		ctx.lineTo(x + 28 + offset, y + height - 22);
		ctx.closePath();
		ctx.fill();
	}
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.font = `700 44px ${getComputedStyle(document.body).fontFamily}`;
	ctx.fillText(`${speed}×`, x + 104, y + height / 2 + 2);
}

function easeOut(x: number): number {
	return 1 - (1 - x) ** 3;
}

/** `cubic-bezier(0.34, 1.56, 0.64, 1)` in CSS */
function easeOutBack(x: number): number {
	const overshoot = 1.70158;
	return 1 + (overshoot + 1) * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
}
