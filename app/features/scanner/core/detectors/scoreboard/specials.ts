/**
 * Kit-icon identification: the team-tinted sub/special tiles (scoreboard
 * special icon, minimap sub tile). Tinted per team, so the match is shape-only:
 * alpha silhouette vs binarized region, NCC + ink-coverage penalty. ~22-30px is
 * enough since it only splits near-tied main icons (Splash- vs Sploosh-o-matic)
 * whose kit silhouettes are far apart (stamp vs crab, bomb vs beakon).
 */
import * as Decisions from "../../decisions";
import {
	createImage,
	type FrameData,
	type Image,
	threshold,
} from "../../image";
import type { MatchSteps } from "../../match-steps";
import { resize } from "../../resize";
import { WEAPON_KITS } from "./kits";
import type { WeaponMatch } from "./weapons";

/** Icon heights (px at 1080p) to try; the row renders it at ~22px. */
const SPECIAL_TEMPLATE_SIZES = [19, 21, 23, 25] as const;

/** Colored icon ink vs the near-black pill, on max(r,g,b). */
const SPECIAL_INK_THRESHOLD = 48;

export interface SpecialTemplate {
	id: string;
	/** binary silhouette + ink pixel count at each templateSizes entry */
	sizes: { image: Image; rows: number; cols: number; ink: number }[];
}

export interface SpecialMatch {
	id: string;
	score: number;
	top: { id: string; score: number }[];
}

/** Binary silhouettes from RGBA icons: tight-crop alpha, binarize, downscale to each height. */
export function prepareSpecialTemplates(
	icons: { id: string; image: FrameData }[],
	templateSizes: readonly number[] = SPECIAL_TEMPLATE_SIZES,
): SpecialTemplate[] {
	return icons.map(({ id, image }) => {
		const { width, height, data } = image;
		let xMin = width;
		let xMax = -1;
		let yMin = height;
		let yMax = -1;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (data[(y * width + x) * 4 + 3]! > 128) {
					if (x < xMin) xMin = x;
					if (x > xMax) xMax = x;
					if (y < yMin) yMin = y;
					if (y > yMax) yMax = y;
				}
			}
		}
		const w = Math.max(1, xMax - xMin + 1);
		const h = Math.max(1, yMax - yMin + 1);
		const silhouette = createImage(h, w, 1);
		const dst = silhouette.data;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				if (data[((y + yMin) * width + x + xMin) * 4 + 3]! > 128) {
					dst[y * w + x] = 255;
				}
			}
		}
		const sizes = templateSizes.map((size) => {
			const scale = size / Math.max(w, h);
			const resized = resize(
				silhouette,
				Math.max(1, Math.round(w * scale)),
				Math.max(1, Math.round(h * scale)),
				"area",
			);
			// re-binarize the interpolated edges to match the search region's two-level scale
			const binary = threshold(resized, 127);
			let ink = 0;
			for (const v of binary.data) if (v > 0) ink++;
			return { image: binary, rows: binary.rows, cols: binary.cols, ink };
		});
		return { id, sizes };
	});
}

/** searchRgb: RGB crop of the icon ROI; binarized on max(r,g,b) so any tint reads as shape. */
export function* matchSpecialSteps(
	searchRgb: Image,
	templates: SpecialTemplate[],
): MatchSteps<SpecialMatch> {
	const { rows, cols } = searchRgb;
	const binary = createImage(rows, cols, 1);
	const src = searchRgb.data;
	const dst = binary.data;
	let searchInk = 0;
	for (let i = 0; i < rows * cols; i++) {
		const v = Math.max(src[i * 3]!, src[i * 3 + 1]!, src[i * 3 + 2]!);
		if (v > SPECIAL_INK_THRESHOLD) {
			dst[i] = 255;
			searchInk++;
		}
	}

	const sizesOf = (template: SpecialTemplate) =>
		template.sizes.filter((size) => size.rows <= rows && size.cols <= cols);
	const [scoreOf] = yield [
		{
			image: binary,
			templates: templates.flatMap((t) => sizesOf(t).map((s) => s.image)),
		},
	];
	const ranked: { id: string; score: number }[] = [];
	let index = 0;
	for (const template of templates) {
		let score = -1;
		for (const { ink } of sizesOf(template)) {
			const maxVal = scoreOf!(index++);
			const r =
				Math.min(ink, searchInk) / Math.max(Math.max(ink, searchInk), 1);
			const adjusted = maxVal * (0.75 + 0.25 * r);
			if (adjusted > score) score = adjusted;
		}
		ranked.push({ id: template.id, score });
	}
	ranked.sort((a, b) => b.score - a.score);
	return {
		id: ranked[0]?.id ?? "unknown",
		score: ranked[0]?.score ?? -1,
		top: ranked,
	};
}

/** Weapon-icon score gap under which two candidates count as a tie. */
const WEAPON_TIE_MARGIN = 0.04;

/**
 * Icon twins differing only by the nozzle: on the replay browser's dim rendering
 * the wrong twin can win by 0.15 (brinewater-1411), far past WEAPON_TIE_MARGIN,
 * so kit evidence is consulted whenever both are in the top candidates.
 * Symmetric pairs, extended per attested fixture need only.
 */
const ICON_TWINS: ReadonlyMap<string, string> = new Map([
	["0", "20"], // Sploosh-o-matic <-> Splash-o-matic
	["20", "0"],
]);

/**
 * Kit evidence must separate tied kits by this much: shape-matcher confusions (Wave Breaker vs Ink
 * Vac) sit inside, true splits (stamp vs crab) clear it.
 */
const KIT_DECISION_MARGIN = 0.06;

type KitPart = "sub" | "special";

/**
 * Candidates tied within WEAPON_TIE_MARGIN (plus the leader's ICON_TWIN) whose kits differ in
 * `part`; null otherwise.
 */
function tiedWeaponsWithDistinctKit(
	match: WeaponMatch,
	part: KitPart,
): { id: string; score: number }[] | null {
	const leader = match.top[0];
	if (!leader) return null;
	const tied = match.top.filter(
		(t) =>
			t === leader ||
			Decisions.below(
				`scoreboard/specials:WEAPON_TIE_MARGIN#${part}`,
				leader.score - t.score,
				WEAPON_TIE_MARGIN,
			),
	);
	const twinId = ICON_TWINS.get(leader.id);
	if (twinId && !tied.some((t) => t.id === twinId)) {
		const twin = match.top.find((t) => t.id === twinId);
		if (twin) tied.push(twin);
	}
	if (tied.length < 2) return null;
	const parts = new Set(
		tied
			.map((t) => WEAPON_KITS.get(t.id)?.[part])
			.filter((s) => s !== undefined),
	);
	return parts.size >= 2 ? tied : null;
}

export function tiedWeaponsWithDistinctSpecials(
	match: WeaponMatch,
): { id: string; score: number }[] | null {
	return tiedWeaponsWithDistinctKit(match, "special");
}

export function tiedWeaponsWithDistinctSubs(
	match: WeaponMatch,
): { id: string; score: number }[] | null {
	return tiedWeaponsWithDistinctKit(match, "sub");
}

/** Re-rank tied candidates by their kit part's tile evidence; only on decisive evidence. */
function disambiguateWeaponByKit(
	match: WeaponMatch,
	evidence: SpecialMatch,
	part: KitPart,
): WeaponMatch {
	const tied = tiedWeaponsWithDistinctKit(match, part);
	if (!tied) return match;
	// worst-possible floor: adjusted NCC never drops below -1
	const kitScore = (weaponId: string): number => {
		const kit = WEAPON_KITS.get(weaponId);
		if (!kit) return -1;
		return evidence.top.find((t) => t.id === String(kit[part]))?.score ?? -1;
	};
	const ranked = [...tied].sort((a, b) => kitScore(b.id) - kitScore(a.id));
	const winner = ranked[0]!;
	if (winner.id === match.id) return match;
	const runnerUp = ranked.find((t) => kitScore(t.id) < kitScore(winner.id));
	if (
		!runnerUp ||
		Decisions.below(
			`scoreboard/specials:KIT_DECISION_MARGIN#${part}`,
			kitScore(winner.id) - kitScore(runnerUp.id),
			KIT_DECISION_MARGIN,
		)
	) {
		return match;
	}
	const top = [winner, ...match.top.filter((t) => t.id !== winner.id)].slice(
		0,
		3,
	);
	const flag: Partial<WeaponMatch> =
		part === "special" ? { specialResolved: true } : { subResolved: true };
	return { ...match, id: winner.id, score: winner.score, top, ...flag };
}

export function disambiguateWeaponBySpecial(
	match: WeaponMatch,
	special: SpecialMatch,
): WeaponMatch {
	return disambiguateWeaponByKit(match, special, "special");
}

export function disambiguateWeaponBySub(
	match: WeaponMatch,
	sub: SpecialMatch,
): WeaponMatch {
	return disambiguateWeaponByKit(match, sub, "sub");
}
