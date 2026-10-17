/**
 * Bun-only image decode/encode (@napi-rs/canvas, Bun.Image). Never imported from core/.
 * Decoding goes through a canvas whose backing store is alpha-premultiplied, so
 * RGB at partial-alpha pixels can shift by ±1; everything read is either fully
 * opaque or consumed premultiplied anyway, so this is lossless in practice.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Image, ImageData } from "@napi-rs/canvas";
import type { FrameData } from "../core/image";

export async function readImage(path: string): Promise<FrameData> {
	const img = new Image();
	// @napi-rs/canvas mis-decodes AVIF at partial-alpha pixels (white-matte
	// leak), so those go through a lossless PNG first
	img.src = path.endsWith(".avif")
		? await new Bun.Image(path).png().buffer()
		: readFileSync(path);
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
