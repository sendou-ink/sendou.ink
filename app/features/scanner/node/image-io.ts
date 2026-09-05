/**
 * Node-only image decode/encode (@napi-rs/canvas). Never imported from core/.
 * Decoding goes through a canvas whose backing store is alpha-premultiplied, so
 * RGB at partial-alpha pixels can shift by ±1; everything read is either fully
 * opaque or consumed premultiplied anyway, so this is lossless in practice.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Image, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import type { FrameData } from "../core/image";

export async function readImage(path: string): Promise<FrameData> {
	// @napi-rs/canvas mis-decodes AVIF at partial-alpha pixels (white-matte
	// leak); sharp returns clean straight-alpha RGBA for those
	if (path.endsWith(".avif")) {
		const { data, info } = await sharp(path)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		return {
			width: info.width,
			height: info.height,
			data: new Uint8ClampedArray(data),
		};
	}
	const img = new Image();
	img.src = readFileSync(path);
	await img.decode();
	const canvas = createCanvas(img.width, img.height);
	const ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0);
	const { width, height, data } = ctx.getImageData(0, 0, img.width, img.height);
	return { width, height, data };
}

export function writePng(path: string, frame: FrameData): void {
	const canvas = createCanvas(frame.width, frame.height);
	const ctx = canvas.getContext("2d");
	ctx.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
	writeFileSync(path, canvas.toBuffer("image/png"));
}
