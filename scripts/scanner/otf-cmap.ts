/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Minimal OpenType cmap reader: which codepoints a font actually maps.
 * @napi-rs/canvas silently falls back to a system font for characters the
 * family lacks (the Blitz cuts have no kanji, hangul or hanzi), which would
 * bake wrong-font glyphs into the atlases. Supports format 4 (BMP segments)
 * and format 12 (grouped full-range), the two the game fonts use.
 */
import { readFileSync } from "node:fs";

export function readFontCoverage(path: string): (codepoint: number) => boolean {
	const buf = readFileSync(path);
	const numTables = buf.readUInt16BE(4);
	let cmapOffset = -1;
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16;
		if (buf.toString("latin1", rec, rec + 4) === "cmap") {
			cmapOffset = buf.readUInt32BE(rec + 8);
			break;
		}
	}
	if (cmapOffset < 0) throw new Error(`${path}: no cmap table`);

	// prefer a full-repertoire format-12 subtable, else the BMP format 4
	const encodingCount = buf.readUInt16BE(cmapOffset + 2);
	let best = -1;
	let bestFormat = -1;
	for (let i = 0; i < encodingCount; i++) {
		const rec = cmapOffset + 4 + i * 8;
		const subtable = cmapOffset + buf.readUInt32BE(rec + 4);
		const format = buf.readUInt16BE(subtable);
		if (format === 12 || (format === 4 && bestFormat !== 12)) {
			best = subtable;
			bestFormat = format;
		}
	}
	if (best < 0) throw new Error(`${path}: no format 4/12 cmap subtable`);

	const ranges: [number, number][] = [];
	if (bestFormat === 12) {
		const nGroups = buf.readUInt32BE(best + 12);
		for (let g = 0; g < nGroups; g++) {
			const rec = best + 16 + g * 12;
			ranges.push([buf.readUInt32BE(rec), buf.readUInt32BE(rec + 4)]);
		}
	} else {
		const segCount = buf.readUInt16BE(best + 6) / 2;
		const endCodes = best + 14;
		const startCodes = endCodes + segCount * 2 + 2;
		for (let s = 0; s < segCount; s++) {
			const start = buf.readUInt16BE(startCodes + s * 2);
			const end = buf.readUInt16BE(endCodes + s * 2);
			if (start !== 0xffff) ranges.push([start, end]);
		}
	}
	return (codepoint) =>
		ranges.some(([start, end]) => codepoint >= start && codepoint <= end);
}
