/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Builds glyph atlases by rendering the Splatoon fonts at the exact scoreboard
 * render sizes, calibrated against the reference fixture:
 *
 *   paint digits  BlitzMain 34px  (tight '0' height ~29px at 1080p)
 *   stat digits   BlitzMain 20px  (~17px)
 *   team digits   BlitzBold 36px  (~28px — bold face, so paint glyphs can't be reused)
 *   names         BlitzMain 20px  (cap height ~17px), ASCII + Latin-1 + kana + symbols
 *
 * The fonts ship with the game and are not committed — drop them into
 * assets/fonts/ (see README); bootstrap-atlas-from-fixture.ts is the fallback.
 *
 * Usage: pnpm scanner:build-glyph-atlas
 * Writes SCANNER_ASSETS_DIR/glyphs/scoreboard-*.{png,json}
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
	DEATH_MESSAGE_TEMPLATES,
	LOCALIZED_WEAPON_NAMES,
} from "../../app/features/scanner/core/detectors/death/localized-messages";
import { ALL_WEAPON_ENTRIES } from "../../app/features/scanner/core/detectors/death/weapon-names";
import type { AtlasMeta } from "../../app/features/scanner/core/glyphs";
import {
	ALL_LOBBY_ENTRIES,
	ALL_MODE_ENTRIES,
	ALL_MODE_LABELS,
	ALL_STAGE_ENTRIES,
	RESULT_TAG_ENTRIES,
} from "../../app/features/scanner/core/localized";
import { SCANNER_ASSETS_DIR } from "../../app/features/scanner/node/assets-dir";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";
import { readFontCoverage } from "./otf-cmap";

/**
 * Atlases are hybrids: fixture-harvested glyphs (bootstrap-atlas-from-fixture.ts,
 * source:"fixture") are exact in-game pixels preserved across rebuilds;
 * font-rendered glyphs fill the rest of the charset and lose ties to them.
 */

const FONTS_DIR = new URL("../../assets/fonts", import.meta.url).pathname;
const OUT_DIR = join(SCANNER_ASSETS_DIR, "glyphs");

const FONT_FILES = {
	BlitzMain: "BlitzMain.otf",
	BlitzBold: "BlitzBold.otf",
	/** replay-browser code line and VICTORY/DEFEAT panel tags */
	Rowdy: "FOT-RowdyStd-EB.otf",
	/** JA death message (together with Rowdy — see death-weapon-ja) */
	Kurokane: "FOT-KurokaneStd-EB.otf",
} as const;

/**
 * Which codepoints each font maps: canvas silently substitutes a system font
 * for the rest (the Blitz cuts have no kanji/hangul/hanzi), so charsets are
 * filtered through this so no wrong-font glyphs get baked into the atlases.
 */
const fontCoverage: Record<string, (codepoint: number) => boolean> = {};

for (const [family, file] of Object.entries(FONT_FILES)) {
	const path = join(FONTS_DIR, file);
	if (!existsSync(path)) {
		console.error(
			[
				`font not found: ${path}`,
				"",
				"The Splatoon fonts are proprietary and not committed. Get",
				"Decrypted/BlitzMain.otf and Decrypted/BlitzBold.otf (e.g. from the",
				"splatoon3-fonts repo) into assets/fonts/, or fall back to",
				"  pnpm scanner:bootstrap-atlas",
			].join("\n"),
		);
		process.exit(1);
	}
	GlobalFonts.registerFromPath(path, family);
	fontCoverage[family] = readFontCoverage(path);
}

const DIGITS = "0123456789";

function nameCharset(): string[] {
	const chars: string[] = [];
	for (let c = 33; c <= 126; c++) chars.push(String.fromCharCode(c)); // ASCII
	for (let c = 0xa1; c <= 0xff; c++) chars.push(String.fromCharCode(c)); // Latin-1
	for (let c = 0x3041; c <= 0x3096; c++) chars.push(String.fromCharCode(c)); // hiragana
	for (let c = 0x30a1; c <= 0x30fa; c++) chars.push(String.fromCharCode(c)); // katakana
	chars.push("・", "ー", "、", "。", "「", "」");
	chars.push("★", "☆", "●", "♪"); // name decorations
	return [...new Set(chars)];
}

/**
 * Greek letters players stylize names with, added per attested fixture only
 * ("Rιppιng_H"): most of the block are homoglyphs of latin/kana at capture
 * fidelity (η~n, ε~c) and displace correct matches on ranking noise. Even a
 * few narrow glyphs shift an atlas's median width enough to change
 * wide-segment splitting, so it stays out of the death-tag charset until attested.
 */
const NAME_GREEK = "ια"; // ι: "Rιppιng_H", α: "◇Dαrz™" (special-symbols fixture)

/**
 * The rest of the in-game name editor's symbol pickers (sendou.ink's
 * IN_GAME_NAME_CHARACTER_CATEGORIES "symbols" + "cjk-symbols"), minus what
 * nameCharset() already carries and chars the Blitz cmap doesn't map
 * (ˊˋ𝑓⁀⚪⚫◻◼⍑; nameSymbols() re-checks at build time). "•" stays out: BlitzMain's
 * bullet is a 4px dot, the on-screen circle comes from "●" via RENDER_ALIASES.
 * Only the fullwidth "～" (U+FF5E), the form fixture labels attest — the wave
 * dash "〜" (U+301C) is a pixel-identical homoglyph that would duel it.
 * Scoreboard-names only (not death-tag) until attested, like NAME_GREEK.
 */
const NAME_SYMBOLS =
	"′‘’‚‛…″“”„←→↑↓⇒⇔˜€∞√∀⊂⊃∴∵∂№♭♀♂◎◇◆△▲▽▼†※™" + "『』【】〈〉《》〔〕々〆〇〃～";

/**
 * Render the key char but emit it as the value: in-game names show "•" as a
 * full-size filled circle (BlitzMain's own "•" is a 4px dot never seen on
 * screen) and fixture labels write it as "•".
 */
const RENDER_ALIASES: Record<string, string> = { "●": "•" };

interface GlyphBitmap {
	char: string;
	w: number;
	h: number;
	/** grayscale, white-on-black (alpha coverage) */
	data: Uint8Array;
	source: "fixture" | "font";
}

/** Carry fixture-harvested glyphs over from the existing atlas, if any. */
async function readFixtureGlyphs(name: string): Promise<GlyphBitmap[]> {
	const pngPath = join(OUT_DIR, `${name}.png`);
	const jsonPath = join(OUT_DIR, `${name}.json`);
	if (!existsSync(pngPath) || !existsSync(jsonPath)) return [];
	const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as AtlasMeta;
	const png = await readImage(pngPath);
	return meta.glyphs
		.filter((g) => g.source === "fixture")
		.map((g) => {
			const data = new Uint8Array(g.w * g.h);
			for (let y = 0; y < g.h; y++) {
				for (let x = 0; x < g.w; x++) {
					data[y * g.w + x] =
						png.data[((g.y + y) * png.width + (g.x + x)) * 4]!;
				}
			}
			return { char: g.char, w: g.w, h: g.h, data, source: "fixture" as const };
		});
}

/**
 * Renders one glyph and tight-crops it via the alpha channel. xScale < 1
 * condenses horizontally (the JA death message renders squeezed to ~3/4 width).
 */
function renderGlyph(
	family: string,
	px: number,
	char: string,
	xScale = 1,
): GlyphBitmap | null {
	const size = px * 4;
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "white";
	ctx.font = `${px}px ${family}`;
	ctx.textBaseline = "middle";
	ctx.scale(xScale, 1);
	ctx.fillText(char, px / xScale, size / 2);
	const img = ctx.getImageData(0, 0, size, size);
	let x0 = size;
	let x1 = -1;
	let y0 = size;
	let y1 = -1;
	let ink = 0;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (img.data[(y * size + x) * 4 + 3]! > 128) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
				ink++;
			}
		}
	}
	if (x1 < 0 || ink < 4) return null;
	const pad = 1;
	const w = x1 - x0 + 1 + 2 * pad;
	const h = y1 - y0 + 1 + 2 * pad;
	const data = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const sx = x0 - pad + x;
			const sy = y0 - pad + y;
			if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
			data[y * w + x] = img.data[(sy * size + sx) * 4 + 3]!;
		}
	}
	return { char, w, h, data, source: "font" };
}

/** Pack glyphs into rows (wrapping at maxWidth) and write PNG + JSON. */
function writeAtlas(name: string, height: number, glyphs: GlyphBitmap[]): void {
	const spacing = 2;
	const maxWidth = 1600;
	const meta: AtlasMeta = { height, glyphs: [] };
	let x = spacing;
	let y = spacing;
	let rowH = 0;
	let atlasW = 0;
	for (const g of glyphs) {
		if (x + g.w + spacing > maxWidth) {
			x = spacing;
			y += rowH + spacing;
			rowH = 0;
		}
		meta.glyphs.push({ char: g.char, x, y, w: g.w, h: g.h, source: g.source });
		x += g.w + spacing;
		rowH = Math.max(rowH, g.h);
		atlasW = Math.max(atlasW, x);
	}
	const atlasH = y + rowH + spacing;

	const pixels = new Uint8ClampedArray(atlasW * atlasH * 4);
	for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
	meta.glyphs.forEach((m, i) => {
		const g = glyphs[i]!;
		for (let gy = 0; gy < g.h; gy++) {
			for (let gx = 0; gx < g.w; gx++) {
				const v = g.data[gy * g.w + gx]!;
				const o = ((m.y + gy) * atlasW + (m.x + gx)) * 4;
				pixels[o] = v;
				pixels[o + 1] = v;
				pixels[o + 2] = v;
			}
		}
	});
	writePng(join(OUT_DIR, `${name}.png`), {
		width: atlasW,
		height: atlasH,
		data: pixels,
	});
	writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
	console.info(
		`${name}: ${glyphs.length} glyphs (${atlasW}x${atlasH}) -> ${name}.{png,json}`,
	);
}

interface AtlasPart {
	family: string;
	/** in-game render size varies by ±1px; multiple template sizes per char */
	pxs: number[];
	chars: string[];
	/** horizontal condensation applied in-game (default 1 = none) */
	xScale?: number;
}

async function build(
	name: string,
	height: number,
	parts: AtlasPart[],
): Promise<void> {
	const glyphs: GlyphBitmap[] = await readFixtureGlyphs(name);
	const fixtureCount = glyphs.length;
	const missing: string[] = [];
	for (const { family, pxs, chars, xScale } of parts) {
		for (const ch of chars) {
			let found = false;
			for (const px of pxs) {
				const g = renderGlyph(family, px, ch, xScale ?? 1);
				if (g) {
					glyphs.push({ ...g, char: RENDER_ALIASES[ch] ?? ch });
					found = true;
				}
			}
			if (!found) missing.push(ch);
		}
	}
	if (missing.length > 0) {
		console.info(
			`${name}: ${missing.length} chars not renderable, skipped: ${missing.join("")}`,
		);
	}
	console.info(
		`${name}: carrying over ${fixtureCount} fixture-harvested glyphs`,
	);
	writeAtlas(name, height, glyphs);
}

/** NAME_SYMBOLS chars the font actually maps (see the constant's comment). */
function nameSymbols(family: string): string[] {
	const covers = fontCoverage[family]!;
	return [...NAME_SYMBOLS].filter((ch) => covers(ch.codePointAt(0)!));
}

/** Unique non-space characters across a set of known strings. */
function charsOf(entries: readonly string[]): string[] {
	return [...new Set(entries.flatMap((e) => [...e.replace(/ /g, "")]))];
}

mkdirSync(OUT_DIR, { recursive: true });
await build("scoreboard-paint-digits", 29, [
	{ family: "BlitzMain", pxs: [34], chars: [...DIGITS] },
]);
await build("scoreboard-stat-digits", 17, [
	{ family: "BlitzMain", pxs: [20], chars: [...DIGITS] },
]);
await build("scoreboard-team-digits", 28, [
	{ family: "BlitzBold", pxs: [36], chars: [...DIGITS] },
]);
await build("scoreboard-names", 17, [
	{
		family: "BlitzMain",
		pxs: [19, 20],
		chars: [...nameCharset(), ...NAME_GREEK, ...nameSymbols("BlitzMain")],
	},
]);
/**
 * Localized closed-set charsets (all 14 game languages), restricted to the
 * Latin scripts (< U+0250) the fixtures attest: wholesale Cyrillic/kana/
 * ideograph glyphs displace Latin matches on ranking noise (adding them
 * regressed the English fixtures), so non-Latin entries stay in the closed
 * sets but their glyphs wait for fixtures. Chars the font doesn't map are
 * dropped too (canvas would render a system-font substitute).
 */
function localizedChars(texts: readonly string[], family: string): string[] {
	const covers = fontCoverage[family]!;
	return charsOf(texts).filter((ch) => {
		const cp = ch.codePointAt(0)!;
		return cp < 0x250 && covers(cp);
	});
}

const lobbyTexts = ALL_LOBBY_ENTRIES.map((e) => e.text);
const modeTexts = ALL_MODE_ENTRIES.map((e) => e.text);
const stageTexts = ALL_STAGE_ENTRIES.map((e) => e.text);
const resultTexts = RESULT_TAG_ENTRIES.map((e) => e.text);

// header: lobby tag is BlitzMain ~24px; the mode/stage line mixes bold mode
// text with regular stage text, so its atlas carries both faces
await build("scoreboard-header-lobby", 19, [
	{
		family: "BlitzMain",
		pxs: [23, 24],
		chars: localizedChars(lobbyTexts, "BlitzMain"),
	},
]);
await build("scoreboard-header-line", 24, [
	{
		family: "BlitzBold",
		pxs: [34, 35],
		chars: localizedChars(modeTexts, "BlitzBold"),
	},
	{
		family: "BlitzMain",
		pxs: [22, 23],
		chars: localizedChars(stageTexts, "BlitzMain"),
	},
]);
// replay browser: the code line and the VICTORY/DEFEAT panel tags render in
// FOT-RowdyStd-EB (tight height 25px at ~32px, 30px at ~38px)
await build("scoreboard-replay-code", 25, [
	{
		family: "Rowdy",
		pxs: [31, 32, 33],
		chars: [...DIGITS, ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "-"],
	},
]);
await build("scoreboard-replay-result", 30, [
	{
		family: "Rowdy",
		pxs: [37, 38],
		chars: localizedChars(resultTexts, "Rowdy"),
	},
]);
// map-start intro splash: the mode title on the center splat is BlitzBold
// (~76px tight caps at 1080p; a px sweep reads best at 99-101), the stage name
// bottom-right is BlitzMain (~40px tight; 46-48px render). The constant "MODE"
// label is BlitzMain too, read with the stage atlas rescaled to ~48px.
await build("map-start-mode", 76, [
	{
		family: "BlitzBold",
		pxs: [99, 100, 101],
		chars: localizedChars(modeTexts, "BlitzBold"),
	},
]);
await build("map-start-stage", 40, [
	{
		family: "BlitzMain",
		pxs: [46, 47, 48],
		chars: localizedChars([...stageTexts, ...ALL_MODE_LABELS], "BlitzMain"),
	},
]);
// death screen: the localized "Splatted by <weapon>!" burst (tight caps ~28px;
// the face reads between the two Blitz cuts at capture fidelity, so carry both)
// and the splash-tag name: BlitzBold for latin, the angular Rowdy face for kana
const deathWeaponTexts = [
	...ALL_WEAPON_ENTRIES.map((e) => e.name),
	...Object.values(LOCALIZED_WEAPON_NAMES).flatMap((names) =>
		names.map((n) => n.text),
	),
	...DEATH_MESSAGE_TEMPLATES.flatMap((t) => [
		t.constText,
		t.weaponPre,
		t.weaponPost,
	]),
];
await build("death-weapon", 34, [
	{
		family: "BlitzMain",
		pxs: [40, 41],
		chars: localizedChars(deathWeaponTexts, "BlitzMain"),
	},
	{
		family: "BlitzBold",
		pxs: [43, 44],
		chars: localizedChars(deathWeaponTexts, "BlitzBold"),
	},
]);
// JA death message, a separate atlas read only by the JA line ROIs: mixing kana
// into the Latin set would shift its median width (breaking wide-segment
// splitting) and displace Latin matches. The in-game JP face renders condensed
// and sits between the two FOT cuts (ス/ク read as Kurokane, で as Rowdy), so
// carry both at the (px, xScale) pairs that peaked in an NCC sweep against the
// classic-squiffer-jp fixture. KO/ZH names stay in the closed sets without an atlas.
const deathJaTexts = [
	...(LOCALIZED_WEAPON_NAMES.JPja ?? []).map((n) => n.text),
	...DEATH_MESSAGE_TEMPLATES.filter((t) =>
		t.langs.some((l) => l.endsWith("ja")),
	).flatMap((t) => [t.constText, t.weaponPre, t.weaponPost]),
];
function coveredChars(texts: readonly string[], family: string): string[] {
	const covers = fontCoverage[family]!;
	return charsOf(texts).filter((ch) => covers(ch.codePointAt(0)!));
}
await build("death-weapon-ja", 40, [
	{
		family: "Kurokane",
		pxs: [44, 46],
		xScale: 0.75,
		chars: coveredChars(deathJaTexts, "Kurokane"),
	},
	{
		family: "Rowdy",
		pxs: [38, 40],
		xScale: 0.8,
		chars: coveredChars(deathJaTexts, "Rowdy"),
	},
]);
// nominal 42 with the detector scaling to 46 reads strictly better than a
// native-46 render (the cubic upscale slightly fattens strokes the way the
// in-game compositing does; a native render splits か into two segments)
await build("death-tag-name", 42, [
	{ family: "BlitzBold", pxs: [53, 54], chars: nameCharset() },
	{ family: "Rowdy", pxs: [52, 54], chars: nameCharset() },
]);
