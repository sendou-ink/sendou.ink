/**
 * What the tournament montage draws over its 1920×1080 frames: the
 * pre-rendered cards (entering with a fade and a slight settle) and, on a
 * clip, its ribbon (for `RIBBON_SECONDS`) and the fast-forward badge.
 */

export const MONTAGE_WIDTH = 1920;
export const MONTAGE_HEIGHT = 1080;

const CARD_FADE_SECONDS = 0.5;
const CARD_SETTLE_SECONDS = 1.2;
const CARD_SETTLE_ZOOM = 0.03;
const RIBBON_SECONDS = 5;
const RIBBON_FADE_SECONDS = 0.4;
const RIBBON_RISE_PX = 24;
const RIBBON_MARGIN_PX = 40;

type Context = OffscreenCanvasRenderingContext2D;

/** A full-frame card `t` seconds into its `seconds` on screen. */
export function drawCard(
	ctx: Context,
	card: ImageBitmap,
	{ t, seconds }: { t: number; seconds: number },
): void {
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, MONTAGE_WIDTH, MONTAGE_HEIGHT);
	const zoom =
		1 + CARD_SETTLE_ZOOM * (1 - easeOut(Math.min(1, t / CARD_SETTLE_SECONDS)));
	const width = MONTAGE_WIDTH * zoom;
	const height = MONTAGE_HEIGHT * zoom;
	ctx.save();
	ctx.globalAlpha = Math.min(
		1,
		Math.max(0, Math.min(t, seconds - t) / CARD_FADE_SECONDS),
	);
	ctx.drawImage(
		card,
		(MONTAGE_WIDTH - width) / 2,
		(MONTAGE_HEIGHT - height) / 2,
		width,
		height,
	);
	ctx.restore();
}

/** The clip's ribbon, bottom center, `t` seconds into the clip; gone after `RIBBON_SECONDS`. */
export function drawRibbon(ctx: Context, ribbon: ImageBitmap, t: number): void {
	if (t >= RIBBON_SECONDS) return;
	const fadeIn = Math.min(1, t / RIBBON_FADE_SECONDS);
	const fadeOut = Math.min(1, (RIBBON_SECONDS - t) / RIBBON_FADE_SECONDS);
	ctx.save();
	ctx.globalAlpha = Math.min(fadeIn, fadeOut);
	ctx.drawImage(
		ribbon,
		(MONTAGE_WIDTH - ribbon.width) / 2,
		MONTAGE_HEIGHT -
			ribbon.height -
			RIBBON_MARGIN_PX +
			(1 - easeOut(fadeIn)) * RIBBON_RISE_PX,
	);
	ctx.restore();
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
