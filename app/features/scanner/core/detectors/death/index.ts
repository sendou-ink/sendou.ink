/**
 * DeathDetector: parses the death cam overlay — "Splatted by <weapon>!"
 * text, the killer's gear abilities (3 rows x [main, sub, sub, sub]), and
 * the killer's name from the tilted splash tag.
 *
 * Weapon reads primarily as OCR text matched against per-language message
 * templates (localized-messages.ts); the constant line doubles as a
 * parse-time confirmation (else a lookalike gate hit emits nothing). Falls
 * back to template-matching the burst weapon icon when the WIPEOUT banner
 * covers the text, then to a candidate-lattice re-rank for low-fidelity
 * captures, then to icon/text corroboration when neither is decisive alone
 * (steps 2c/2d).
 */
import type {
	AbilityWithUnknown,
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { toAbilityWithUnknown } from "../../../scanner-types";
import { getCV, type Mat, minMaxLoc } from "../../cv";
import {
	type GlyphSet,
	type RecognizedText,
	recognizeText,
	scaleGlyphSet,
} from "../../glyphs";
import { copyRoi, cropRoi, meanBrightness, type Roi } from "../../image";
import { closestEntry, matchKey, rankBy, rankByRead } from "../../text";
import type { ScoreboardResources } from "../scoreboard/index";
import { parseName } from "../scoreboard/names";
import { matchWeapon, type WeaponMatch } from "../scoreboard/weapons";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	DEATH_MESSAGE_TEMPLATES,
	type DeathMessageTemplate,
	LOCALIZED_WEAPON_NAMES,
} from "./localized-messages";
import {
	ABILITY_INK_THRESHOLD,
	ABILITY_ROWS,
	ABILITY_SLOT_MIN_INK,
	ABILITY_SUB_XS,
	abilityMainRoi,
	abilitySubRoi,
	BURST_ICON_ROI,
	GATE_BURST_PROBES,
	GATE_DARK_MAX_MEAN,
	GATE_ICON_MIN_MAX,
	GATE_PANEL_PROBES,
	GATE_TEXT_MAX_FRACTION,
	GATE_TEXT_MIN_MAX,
	gateAbilityProbe,
	JA_CONST_LINE_ROI,
	JA_WEAPON_LINE_ROI,
	SPLAT_LINE1_ROI,
	SPLAT_TEXT_BIN_THRESHOLD,
	TAG_NAME_INNER,
	TAG_NAME_OUTER,
	TAG_NAME_TEXT_HEIGHT,
	TAG_TILT_DEG,
	WEAPON_LINE_ROI,
	WEAPON_TEXT_HEIGHT,
} from "./rois";
import {
	ALL_WEAPON_ENTRIES,
	type WeaponEntry,
	type WeaponType,
} from "./weapon-names";

export interface DeathData {
	/**
	 * the killer's weapon id — a sendou main/sub/special weapon id, unique
	 * only within its kind (`weaponType` disambiguates); null if unreadable
	 */
	weaponId: MainWeaponId | SubWeaponId | SpecialWeaponId | null;
	/** which kind of weapon got the splat; null when the weapon is unreadable */
	weaponType: WeaponType | null;
	/**
	 * killer's gear abilities, [head, clothes, shoes] rows of [main, sub...]
	 * ability ids; rows carry as many sub entries as the gear has slots (1-3)
	 */
	abilities: AbilityWithUnknown[][];
	/** killer's splash-tag name; null if unreadable */
	name: string | null;
}

export const DEATH_EVENT_TYPE = "Death";

/** The constant message line must read back at least this well to emit. */
const LINE1_MIN_SCORE = 0.5;
/**
 * A Latin template's constant line reading at least this well settles the
 * language and the (expensive) JA line reads are skipped. Fixture-measured:
 * Latin-language frames read their template at 0.889+, while JA frames'
 * best Latin-template score is 0.222.
 */
const LATIN_DECISIVE_SCORE = 0.85;
/** Snapped weapon reading below this is reported as null (kept in debug). */
const WEAPON_MIN_SCORE = 0.55;
/** Burst-icon fallback match below this is ignored (kept in debug). */
const BURST_ICON_MIN_SCORE = 0.52;
/**
 * Candidate-lattice re-rank acceptance (rankByRead — its scores sit well
 * below the plain-snap scale; see text.ts). On the 720p-upscaled JP
 * frames that motivated it, correct picks score 0.25-0.47 with a margin
 * of 0.056+ over the nearest other weapon, while wrong picks margin
 * <= 0.03 — the margin, not the score, is the discriminator.
 */
const LATTICE_MIN_SCORE = 0.22;
const LATTICE_MIN_MARGIN = 0.05;
/**
 * Burst-icon corroboration: below the decisive threshold the icon alone
 * can't be trusted, but when the garbled text *independently* ranks the
 * icon's weapon at (or within EPS of) its own top, the two weak signals
 * agree out of ~350 candidates and the weapon is accepted. Floor sits at
 * the weakest corroborated fixture positive (Splat Dualies at 0.33).
 */
const BURST_ICON_CORROBORATE_MIN_SCORE = 0.3;
const CORROBORATE_EPS = 0.02;
const TAG_NAME_BIN_THRESHOLD = 160;
/**
 * The text-color refinement band is absolute closeness (255 - distance) to
 * the estimated text color, so its threshold is tight by construction:
 * 215 keeps pixels within 40 of the text color — glyph cores — while art
 * highlights that leak past the banner-median band sit further away.
 */
const TAG_NAME_REFINE_BIN_THRESHOLD = 215;
/** Don't trust a text-color estimate taken from fewer ink pixels. */
const TAG_NAME_REFINE_MIN_INK = 200;
/**
 * Split-banner detection: some banners paint the name band in two flat
 * hues (diagonal splits). Any single background estimate turns the other
 * half into one huge "ink" blob that border-clearing deletes together
 * with the glyphs standing on it, so when a second quantized color bin
 * both covers a real share of the band and sits far from the first, a
 * third read candidate measures distance from the *nearest* of the two.
 * The share floor keeps the text color itself (or sparse art) from being
 * mistaken for a second background, which would erase the glyphs.
 */
const TAG_SPLIT_MIN_FRACTION = 0.15;
const TAG_SPLIT_MIN_CHANNEL_DISTANCE = 40;

/**
 * The splash-tag read dominates parse cost — a CJK name OCRs against the
 * full name atlas for tens of seconds, 90%+ of a slow death parse — and
 * the same killer's tag recurs pixel-identical, both across the frames of
 * one death's parse streak and across their later kills. Reads are
 * memoized on a small downscaled signature of the leveled tag band:
 * VoD-measured mean abs diffs are ≤1 between reads of one killer's tag
 * (even across different deaths) and ≥95 between different killers, so
 * the threshold has a wide margin on both sides.
 */
const TAG_MEMO_WIDTH = 48;
const TAG_MEMO_HEIGHT = 12;
const TAG_MEMO_MAX_MEAN_DIFF = 12;
const TAG_MEMO_MAX_ENTRIES = 16;
/** A failed read is not worth pinning onto every later frame of its tag. */
const TAG_MEMO_MIN_CONFIDENCE = 0.5;

interface TagNameRead {
	name: string | null;
	confidence: number;
	raw: string;
	background: [number, number, number] | null;
	textColor: [number, number, number] | null;
}

interface WeaponCandidate {
	/** the full weapon line as this template renders it, e.g. "Durch Klecksroller" */
	text: string;
	entry: WeaponEntry;
}

/** JA templates read through the JA atlas and the swapped-width line ROIs. */
function isJaTemplate(t: DeathMessageTemplate): boolean {
	return t.langs.some((lang) => lang.endsWith("ja"));
}

/**
 * The weapon-line strings a template can show: that language's localized
 * names plus every canonical English name (localized-messages omits names
 * identical to English), wrapped in the template's constant pre/post text.
 */
const templateCandidates = new Map<DeathMessageTemplate, WeaponCandidate[]>();
function candidatesFor(template: DeathMessageTemplate): WeaponCandidate[] {
	let candidates = templateCandidates.get(template);
	if (candidates) return candidates;
	const byName = new Map(ALL_WEAPON_ENTRIES.map((e) => [e.name, e]));
	const seen = new Set<string>();
	candidates = [];
	const push = (text: string, entry: WeaponEntry | undefined) => {
		const k = matchKey(text);
		if (!entry || seen.has(k)) return;
		seen.add(k);
		candidates!.push({
			text: template.weaponPre + text + template.weaponPost,
			entry,
		});
	};
	for (const lang of template.langs) {
		for (const { text, name } of LOCALIZED_WEAPON_NAMES[lang] ?? [])
			push(text, byName.get(name));
	}
	for (const entry of ALL_WEAPON_ENTRIES) push(entry.name, entry);
	templateCandidates.set(template, candidates);
	return candidates;
}

export function createDeathDetector(
	resources: ScoreboardResources,
): Detector<DeathData> {
	const cv = getCV();

	const scaled = (
		set: GlyphSet | null | undefined,
		height: number,
	): GlyphSet | null => (set ? scaleGlyphSet(set, height / set.height) : null);

	const weaponGlyphs = scaled(resources.deathWeaponGlyphs, WEAPON_TEXT_HEIGHT);
	// JA glyphs match at native scale: the atlas mixes fixture crops with
	// per-face renders already sized to the on-screen condensed text
	const jaGlyphs = resources.deathWeaponJaGlyphs ?? null;
	const tagNameGlyphs = scaled(
		resources.deathTagNameGlyphs,
		TAG_NAME_TEXT_HEIGHT,
	);
	const abilities = resources.abilities ?? null;
	const burstWeapons = resources.deathBurstWeapons ?? null;
	const mainById = new Map(
		ALL_WEAPON_ENTRIES.filter((e) => e.type === "MAIN").map((e) => [e.id, e]),
	);

	function gate(frame: Mat): GateResult {
		let darkOk = 0;
		const darkProbes = [...GATE_BURST_PROBES, ...GATE_PANEL_PROBES];
		for (const roi of darkProbes) {
			if (meanBrightness(frame, roi) < GATE_DARK_MAX_MEAN) darkOk++;
		}

		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const line1 = copyRoi(gray, SPLAT_LINE1_ROI);
		const { maxVal } = minMaxLoc(line1);
		const bin = new cv.Mat();
		cv.threshold(line1, bin, GATE_TEXT_MIN_MAX, 255, cv.THRESH_BINARY);
		line1.delete();
		const whiteFraction = cv.countNonZero(bin) / (bin.rows * bin.cols);
		bin.delete();
		const textOk =
			maxVal > GATE_TEXT_MIN_MAX &&
			whiteFraction > 0.01 &&
			whiteFraction < GATE_TEXT_MAX_FRACTION;

		// max RGB channel, not gray: saturated icon art can be gray-dark (rois.ts)
		let iconOk = 0;
		for (const row of [0, 1, 2]) {
			const probe = copyRoi(frame, gateAbilityProbe(row));
			const d = probe.data;
			const ch = probe.channels();
			const n = probe.rows * probe.cols;
			let maxCh = 0;
			for (let i = 0; i < n; i++) {
				const v = Math.max(d[i * ch]!, d[i * ch + 1]!, d[i * ch + 2]!);
				if (v > maxCh) maxCh = v;
			}
			probe.delete();
			if (maxCh > GATE_ICON_MIN_MAX) iconOk++;
		}
		gray.delete();

		const score =
			(darkOk / darkProbes.length + (textOk ? 1 : 0) + iconOk / 3) / 3;
		return {
			pass: darkOk === darkProbes.length && textOk && iconOk === 3,
			score,
		};
	}

	/** Crop the tilted tag, rotate it level, and return the name band crop. */
	function levelTagInner(rgb: Mat): Mat {
		const outer = copyRoi(rgb, TAG_NAME_OUTER);
		const center = new cv.Point(outer.cols / 2, outer.rows / 2);
		const m = cv.getRotationMatrix2D(center, -TAG_TILT_DEG, 1);
		const rotated = new cv.Mat();
		cv.warpAffine(
			outer,
			rotated,
			m,
			new cv.Size(outer.cols, outer.rows),
			cv.INTER_LINEAR,
			cv.BORDER_REPLICATE,
			new cv.Scalar(),
		);
		m.delete();
		outer.delete();
		const inner = copyRoi(rotated, TAG_NAME_INNER);
		rotated.delete();
		return inner;
	}

	const tagMemo: { signature: Uint8Array; read: TagNameRead }[] = [];

	function tagSignature(inner: Mat): Uint8Array {
		const small = new cv.Mat();
		cv.resize(
			inner,
			small,
			new cv.Size(TAG_MEMO_WIDTH, TAG_MEMO_HEIGHT),
			0,
			0,
			cv.INTER_AREA,
		);
		const signature = new Uint8Array(small.data);
		small.delete();
		return signature;
	}

	/** Memoized read for a matching tag, freshened to the list's end. */
	function tagMemoLookup(signature: Uint8Array): TagNameRead | null {
		for (let i = 0; i < tagMemo.length; i++) {
			const entry = tagMemo[i]!;
			let sum = 0;
			for (let k = 0; k < signature.length; k++) {
				sum += Math.abs(signature[k]! - entry.signature[k]!);
			}
			if (sum / signature.length <= TAG_MEMO_MAX_MEAN_DIFF) {
				tagMemo.splice(i, 1);
				tagMemo.push(entry);
				return entry.read;
			}
		}
		return null;
	}

	function tagMemoStore(signature: Uint8Array, read: TagNameRead): void {
		tagMemo.push({ signature, read });
		if (tagMemo.length > TAG_MEMO_MAX_ENTRIES) tagMemo.shift();
	}

	/** Per-channel median color of `inner`, over pixels where mask(i) holds. */
	function medianColor(
		inner: Mat,
		mask?: (i: number) => boolean,
	): [number, number, number] {
		const n = inner.rows * inner.cols;
		const px = inner.data;
		const color: [number, number, number] = [0, 0, 0];
		for (let c = 0; c < 3; c++) {
			const hist = new Array<number>(256).fill(0);
			let total = 0;
			for (let i = 0; i < n; i++) {
				if (mask && !mask(i)) continue;
				hist[px[i * 3 + c]!]!++;
				total++;
			}
			let acc = 0;
			let v = 0;
			for (; v < 255; v++) {
				acc += hist[v]!;
				if (acc >= total / 2) break;
			}
			color[c] = v;
		}
		return color;
	}

	/**
	 * Dominant colors of `inner`: most frequent quantized colors (5 bits/
	 * channel), clustered by proximity (else a hue straddling a quantization
	 * boundary under-reports, split across neighbor bins), each refined to
	 * its per-channel median with its share of the band. A second background
	 * estimator besides medianColor — neither wins everywhere (whole-image
	 * medians blend distinct populations into a color nobody has; the bin
	 * vote loses to a flat art blob out-voting a textured banner's true
	 * color) — so both are tried and the better read kept. The runner-up
	 * cluster feeds the split-banner candidate (see TAG_SPLIT_MIN_FRACTION).
	 */
	function dominantColors(
		inner: Mat,
		count: number,
	): { color: [number, number, number]; fraction: number }[] {
		const n = inner.rows * inner.cols;
		const px = inner.data;
		const bins = new Map<number, number>();
		for (let i = 0; i < n; i++) {
			const key =
				((px[i * 3]! >> 3) << 10) |
				((px[i * 3 + 1]! >> 3) << 5) |
				(px[i * 3 + 2]! >> 3);
			bins.set(key, (bins.get(key) ?? 0) + 1);
		}
		// greedy cluster of the top bins by quantized-center proximity
		const CLUSTER_MAX_CHANNEL_DISTANCE = 24;
		const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
		const centerOf = (key: number): [number, number, number] => [
			((key >> 10) << 3) + 4,
			(((key >> 5) & 31) << 3) + 4,
			((key & 31) << 3) + 4,
		];
		const clusters: {
			seed: [number, number, number];
			keys: Set<number>;
			count: number;
		}[] = [];
		for (const [key, binCount] of top) {
			const c = centerOf(key);
			const home = clusters.find((cl) =>
				cl.seed.every(
					(s, i) => Math.abs(s - c[i]!) <= CLUSTER_MAX_CHANNEL_DISTANCE,
				),
			);
			if (home) {
				home.keys.add(key);
				home.count += binCount;
			} else {
				clusters.push({ seed: c, keys: new Set([key]), count: binCount });
			}
		}
		return clusters
			.sort((a, b) => b.count - a.count)
			.slice(0, count)
			.map(({ keys, count: clusterCount }) => {
				const inCluster = (i: number) =>
					keys.has(
						((px[i * 3]! >> 3) << 10) |
							((px[i * 3 + 1]! >> 3) << 5) |
							(px[i * 3 + 2]! >> 3),
					);
				return {
					color: medianColor(inner, inCluster),
					fraction: clusterCount / n,
				};
			});
	}

	/**
	 * Text-ness map: per-pixel max-channel distance from the nearest of
	 * `colors` (one for solid banners, two hues for a split banner). Uses
	 * distance from banner color rather than a fixed brightness/polarity
	 * since text/banner colors vary per player (e.g. pink text on a
	 * light-blue banner has near-zero luminance contrast). `invert` flips to
	 * *closeness* for the text-color refinement pass.
	 */
	function distanceBand(
		inner: Mat,
		colors: readonly [number, number, number][],
		invert: boolean,
	): Mat {
		const n = inner.rows * inner.cols;
		const px = inner.data;
		const band = new cv.Mat(inner.rows, inner.cols, cv.CV_8UC1);
		const out = band.data;
		for (let i = 0; i < n; i++) {
			let d = 255;
			for (const color of colors) {
				const dc = Math.max(
					Math.abs(px[i * 3]! - color[0]),
					Math.abs(px[i * 3 + 1]! - color[1]),
					Math.abs(px[i * 3 + 2]! - color[2]),
				);
				if (dc < d) d = dc;
			}
			out[i] = invert ? 255 - d : d;
		}
		return band;
	}

	/**
	 * Zero ink components touching the band border. Busy banner art also
	 * differs from the median banner color but continues past the name
	 * band's edges, while the name sits inside it (fixture extremes: dakuten
	 * at y=3, descender 2px above bottom) — left in place an edge blob
	 * merges into a glyph and corrupts the read.
	 */
	function clearBorderBlobs(band: Mat, threshold: number): void {
		const bin = new cv.Mat();
		cv.threshold(band, bin, threshold, 255, cv.THRESH_BINARY);
		const labels = new cv.Mat();
		const stats = new cv.Mat();
		const centroids = new cv.Mat();
		const count = cv.connectedComponentsWithStats(
			bin,
			labels,
			stats,
			centroids,
			8,
		);
		bin.delete();
		centroids.delete();
		const s = stats.data32S;
		const touchesBorder = new Uint8Array(count);
		for (let i = 1; i < count; i++) {
			const left = s[i * 5 + cv.CC_STAT_LEFT]!;
			const top = s[i * 5 + cv.CC_STAT_TOP]!;
			const right = left + s[i * 5 + cv.CC_STAT_WIDTH]!;
			const bottom = top + s[i * 5 + cv.CC_STAT_HEIGHT]!;
			touchesBorder[i] =
				left === 0 || top === 0 || right === band.cols || bottom === band.rows
					? 1
					: 0;
		}
		stats.delete();
		const lab = labels.data32S;
		const out = band.data;
		for (let i = 0; i < out.length; i++) {
			if (touchesBorder[lab[i]!]!) out[i] = 0;
		}
		labels.delete();
	}

	function parse(frame: Mat, t: number): DetectedEvent<DeathData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);

		const confidences: number[] = [];

		// 1. read both burst lines and find the language template whose constant
		// line reads back best — a gate hit matching none is a lookalike.
		// Latin templates read the standard line boxes with the Latin atlas;
		// JA templates read the swapped-width JA boxes (weapon line 1 wide,
		// constant line 2 narrow — see rois.ts) with the JA atlas, so the two
		// scripts never compete inside one glyph set.
		let line1: RecognizedText | null = null;
		let line2: RecognizedText | null = null;
		let jaWeaponLine: RecognizedText | null = null;
		let jaConstLine: RecognizedText | null = null;
		let template: DeathMessageTemplate | null = null;
		let line1Score = 0;
		if (weaponGlyphs) {
			const readLine = (roi: Roi, glyphs: GlyphSet) => {
				const crop = cropRoi(gray, roi);
				const read = recognizeText(crop, glyphs, {
					binThreshold: SPLAT_TEXT_BIN_THRESHOLD,
					minCharScore: 0.3,
				});
				crop.delete();
				return read;
			};
			line1 = readLine(SPLAT_LINE1_ROI, weaponGlyphs);
			line2 = readLine(WEAPON_LINE_ROI, weaponGlyphs);
			for (const t of DEATH_MESSAGE_TEMPLATES) {
				if (isJaTemplate(t)) continue;
				const constReading = t.weaponLine === 1 ? line2.text : line1.text;
				const score = closestEntry(constReading, [t.constText])?.score ?? 0;
				if (score > line1Score) {
					line1Score = score;
					template = t;
				}
			}
			// the JA line reads cost ~2x the Latin ones (condensed-kana atlas),
			// so they only run when no Latin template already owns the frame:
			// measured constant-line scores separate cleanly (Latin frames read
			// their template at 0.889+, JA frames' best Latin score is <= 0.222)
			if (jaGlyphs && line1Score < LATIN_DECISIVE_SCORE) {
				jaWeaponLine = readLine(JA_WEAPON_LINE_ROI, jaGlyphs);
				jaConstLine = readLine(JA_CONST_LINE_ROI, jaGlyphs);
				for (const t of DEATH_MESSAGE_TEMPLATES) {
					if (!isJaTemplate(t)) continue;
					const score =
						closestEntry(jaConstLine.text, [t.constText])?.score ?? 0;
					if (score > line1Score) {
						line1Score = score;
						template = t;
					}
				}
			}
			if (!template || line1Score < LINE1_MIN_SCORE) {
				gray.delete();
				rgb.delete();
				return [];
			}
		}

		// 2. the other line carries the weapon name; snap it to the template
		// language's names (localized + canonical English)
		let weapon: string | null = null;
		let weaponId: DeathData["weaponId"] = null;
		let weaponType: WeaponType | null = null;
		let weaponScore = 0;
		let weaponRaw: RecognizedText | null = null;
		let plainRanked: { entry: WeaponCandidate; score: number }[] = [];
		const accept = (entry: WeaponEntry, score: number) => {
			weapon = entry.name;
			weaponId = Number(entry.id) as NonNullable<DeathData["weaponId"]>;
			weaponType = entry.type;
			weaponScore = score;
		};
		if (weaponGlyphs && template) {
			weaponRaw = isJaTemplate(template)
				? jaWeaponLine
				: template.weaponLine === 1
					? line1
					: line2;
			const reading = weaponRaw!.text;
			if (reading)
				plainRanked = rankBy(reading, candidatesFor(template), (c) => c.text);
			const match = plainRanked[0];
			if (match) {
				weaponScore = match.score;
				if (match.score >= WEAPON_MIN_SCORE)
					accept(match.entry.entry, match.score);
			}
		}

		// 2b. text can be unreadable while the burst's weapon icon is intact
		// (the WIPEOUT banner covers the weapon name line), so fall back to
		// matching the icon against the main-weapon set at burst size. Only a
		// decisive match is trusted: fixture positives score 0.55+ while the
		// best off-target frame (icon displaced by a rainmaker line) hits 0.48.
		let burstIcon: WeaponMatch | null = null;
		if (weapon === null && burstWeapons) {
			const crop = cropRoi(rgb, BURST_ICON_ROI);
			burstIcon = matchWeapon(crop, burstWeapons);
			crop.delete();
			const entry =
				burstIcon.score >= BURST_ICON_MIN_SCORE
					? mainById.get(burstIcon.id)
					: undefined;
			if (entry) accept(entry, burstIcon.score);
		}

		// 2c. low-fidelity captures (720p upscaled to canonical) garble the
		// per-segment top-1 read enough that the plain snap stays under
		// WEAPON_MIN_SCORE, while the correct glyphs sit at rank 2-3 of the
		// segments' candidate lists. Re-rank through those lists (rankByRead)
		// and accept the top weapon when it clears the field decisively.
		let latticeTop: {
			entry: WeaponEntry;
			score: number;
			margin: number;
		} | null = null;
		let latticeRanked: { entry: WeaponCandidate; score: number }[] = [];
		if (
			weapon === null &&
			weaponGlyphs &&
			template &&
			weaponRaw!.chars.length > 0
		) {
			latticeRanked = rankByRead(
				weaponRaw!.chars,
				candidatesFor(template),
				(c) => c.text,
			);
			const top = latticeRanked[0]!;
			// margin vs the nearest *other* weapon: the same weapon rides both
			// its localized and English candidate lines
			const runner = latticeRanked.find(
				(r) => r.entry.entry !== top.entry.entry,
			);
			latticeTop = {
				entry: top.entry.entry,
				score: top.score,
				margin: top.score - (runner?.score ?? 0),
			};
			if (
				latticeTop.score >= LATTICE_MIN_SCORE &&
				latticeTop.margin >= LATTICE_MIN_MARGIN
			) {
				accept(latticeTop.entry, latticeTop.score);
			}
		}

		// 2d. neither signal is decisive alone, but if the burst icon's main
		// weapon is also the text's best guess (plain or lattice ranking,
		// within EPS of that ranking's top), the independent agreement is
		// decisive together.
		if (
			weapon === null &&
			burstIcon &&
			burstIcon.score >= BURST_ICON_CORROBORATE_MIN_SCORE
		) {
			const entry = mainById.get(burstIcon.id);
			if (entry) {
				const bestFor = (ranked: { entry: WeaponCandidate; score: number }[]) =>
					ranked.reduce(
						(s, r) => (r.entry.entry === entry ? Math.max(s, r.score) : s),
						0,
					);
				const supported =
					(plainRanked.length > 0 &&
						bestFor(plainRanked) >= plainRanked[0]!.score - CORROBORATE_EPS) ||
					(latticeRanked.length > 0 &&
						bestFor(latticeRanked) >=
							latticeRanked[0]!.score - CORROBORATE_EPS);
				if (supported) accept(entry, burstIcon.score);
			}
		}
		if (weaponGlyphs && template) confidences.push(weaponScore);

		// 3. ability grid; rows carry 1-3 sub circles (left-aligned, as many
		// as the gear has slots), so a sub box without badge ink ends the row
		const abilityRows: AbilityWithUnknown[][] = [];
		const abilityDebug: (WeaponMatch | null)[][] = [];
		if (abilities) {
			for (let row = 0; row < ABILITY_ROWS; row++) {
				const ids: AbilityWithUnknown[] = [];
				const debug: (WeaponMatch | null)[] = [];
				const mainCrop = cropRoi(rgb, abilityMainRoi(row));
				const main = matchWeapon(mainCrop, abilities.mains, {
					inkThreshold: ABILITY_INK_THRESHOLD,
				});
				mainCrop.delete();
				ids.push(toAbilityWithUnknown(main.id) ?? "UNKNOWN");
				debug.push(main);
				confidences.push(Math.max(0, main.score));
				for (let slot = 0; slot < ABILITY_SUB_XS.length; slot++) {
					const crop = copyRoi(rgb, abilitySubRoi(row, slot));
					const d = crop.data;
					const n = crop.rows * crop.cols;
					let ink = 0;
					for (let i = 0; i < n; i++) {
						const v = Math.max(d[i * 3]!, d[i * 3 + 1]!, d[i * 3 + 2]!);
						if (v > ABILITY_INK_THRESHOLD) ink++;
					}
					if (ink < ABILITY_SLOT_MIN_INK) {
						crop.delete();
						break;
					}
					const sub = matchWeapon(crop, abilities.subs, {
						inkThreshold: ABILITY_INK_THRESHOLD,
					});
					crop.delete();
					ids.push(toAbilityWithUnknown(sub.id) ?? "UNKNOWN");
					debug.push(sub);
					confidences.push(Math.max(0, sub.score));
				}
				abilityRows.push(ids);
				abilityDebug.push(debug);
			}
		}

		// 4. splash-tag name: read against the estimated banner color, then
		// (since busy banner art also differs from that estimate and can
		// survive as fake glyphs) against closeness to the text color
		// estimated from pass 1's ink; whichever reads back more confidently
		// wins. Both background estimators (dominantColors) run the same way.
		let name: string | null = null;
		let nameConfidence = 0;
		let nameRaw = "";
		let tagBackground: [number, number, number] | null = null;
		let tagTextColor: [number, number, number] | null = null;
		let nameMemoHit = false;
		if (tagNameGlyphs) {
			const spaceGap = Math.max(
				7,
				Math.round(tagNameGlyphs.medianWidth * 0.55),
			);
			const inner = levelTagInner(rgb);
			const signature = tagSignature(inner);
			const memoized = tagMemoLookup(signature);
			nameMemoHit = memoized !== null;
			const readWithBackground = (
				backgrounds: readonly [number, number, number][],
			) => {
				const band = distanceBand(inner, backgrounds, false);
				cv.normalize(band, band, 0, 255, cv.NORM_MINMAX);
				clearBorderBlobs(band, TAG_NAME_BIN_THRESHOLD);
				let parsed = parseName(band, tagNameGlyphs, {
					spaceGap,
					binThreshold: TAG_NAME_BIN_THRESHOLD,
				});

				let textColor: [number, number, number] | null = null;
				const ink = band.data;
				let inkCount = 0;
				for (let i = 0; i < ink.length; i++)
					if (ink[i]! > TAG_NAME_BIN_THRESHOLD) inkCount++;
				if (inkCount >= TAG_NAME_REFINE_MIN_INK) {
					textColor = medianColor(
						inner,
						(i) => ink[i]! > TAG_NAME_BIN_THRESHOLD,
					);
					const refined = distanceBand(inner, [textColor], true);
					clearBorderBlobs(refined, TAG_NAME_REFINE_BIN_THRESHOLD);
					const reparsed = parseName(refined, tagNameGlyphs, {
						spaceGap,
						binThreshold: TAG_NAME_REFINE_BIN_THRESHOLD,
					});
					refined.delete();
					if (reparsed.confidence > parsed.confidence) parsed = reparsed;
				}
				band.delete();
				return { parsed, background: backgrounds[0]!, textColor };
			};

			let read = memoized;
			if (read === null) {
				const median = medianColor(inner);
				const dominants = dominantColors(inner, 2);
				const dominant = dominants[0]!.color;
				const candidates: [number, number, number][][] = [[median]];
				if (dominant.some((c, i) => Math.abs(c - median[i]!) > 8))
					candidates.push([dominant]);
				const second = dominants[1];
				if (
					second &&
					second.fraction >= TAG_SPLIT_MIN_FRACTION &&
					second.color.some(
						(c, i) =>
							Math.abs(c - dominant[i]!) > TAG_SPLIT_MIN_CHANNEL_DISTANCE,
					)
				) {
					candidates.push([dominant, second.color]);
				}
				// an empty read never beats one with glyphs (an estimate landing on
				// the text color blanks the band, and recognizeText scores a
				// segment-less band confidence 1); near-tied confidences resolve to
				// the longer read, since confidence is the *min* char score and
				// erasing most of the name can still read the survivors immaculately
				const NEAR_TIE = 0.03;
				const beats = (
					a: { parsed: { name: string; confidence: number } },
					b: typeof a,
				) => {
					const aRead = a.parsed.name.length > 0 ? 1 : 0;
					const bRead = b.parsed.name.length > 0 ? 1 : 0;
					if (aRead !== bRead) return aRead - bRead;
					if (Math.abs(a.parsed.confidence - b.parsed.confidence) <= NEAR_TIE) {
						return a.parsed.name.length - b.parsed.name.length;
					}
					return a.parsed.confidence - b.parsed.confidence;
				};
				let best = readWithBackground(candidates[0]!);
				for (const backgrounds of candidates.slice(1)) {
					const alt = readWithBackground(backgrounds);
					if (beats(alt, best) > 0) best = alt;
				}
				read = {
					name: best.parsed.name.length > 0 ? best.parsed.name : null,
					confidence: best.parsed.confidence,
					raw: best.parsed.raw.text,
					background: best.background,
					textColor: best.textColor,
				};
				if (read.confidence >= TAG_MEMO_MIN_CONFIDENCE && read.name !== null) {
					tagMemoStore(signature, read);
				}
			}
			inner.delete();

			tagBackground = read.background;
			tagTextColor = read.textColor;
			nameRaw = read.raw;
			name = read.name;
			nameConfidence = read.confidence;
			confidences.push(nameConfidence);
		}

		gray.delete();
		rgb.delete();

		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: DEATH_EVENT_TYPE,
				t,
				confidence,
				data: { weaponId, weaponType, abilities: abilityRows, name },
				debug: {
					weaponName: weapon,
					line1: line1?.text,
					line2: line2?.text,
					jaWeaponLine: jaWeaponLine?.text,
					jaConstLine: jaConstLine?.text,
					line1Score,
					messageLangs: template?.langs,
					weaponRaw: weaponRaw?.text,
					weaponScore,
					weaponLattice: latticeTop && {
						name: latticeTop.entry.name,
						score: latticeTop.score,
						margin: latticeTop.margin,
					},
					burstIcon: burstIcon && {
						id: burstIcon.id,
						score: burstIcon.score,
						top: burstIcon.top,
					},
					abilityRows: abilityDebug.map((row) =>
						row.map((m) => m && { top: m.top, score: m.score }),
					),
					nameRaw,
					nameScore: nameConfidence,
					nameMemoHit,
					tagBackground,
					tagTextColor,
				},
			},
		];
	}

	// the death cam's animated background flickers the gate; after a
	// sufficient read the 4s rearm hold stays inside the timeline's 8s
	// Death merge window, so every parse it skips would merge anyway.
	// sufficientConfidence sits just under the measured clean-read floor
	// (fixtures 0.750-0.825, confirmed scan events 0.751+); the refine and
	// stagnation overrides cap what a parse can cost when a dirty read
	// never reaches it, and the tag memo keeps the streak's repeat parses
	// off the expensive name read (a first-sight CJK name runs tens of
	// seconds; repeats must not)
	return {
		id: "death",
		refineIntervalS: 0.5,
		sufficientConfidence: 0.74,
		rearmCooldownS: 4,
		maxStagnantParses: 3,
		gate,
		parse,
	};
}
