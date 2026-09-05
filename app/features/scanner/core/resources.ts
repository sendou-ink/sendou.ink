/**
 * Environment-agnostic assembly of ScoreboardResources: Node (filesystem) and
 * the worker (HTTP) inject only the IO primitives; every resource key, icon
 * directory, template option set and atlas name lives here once. Icon/atlas
 * decoding is eager (cheap); template prep and atlas slicing are memoized
 * getters, since unused sets (four weapon-template builds alone are ~7k
 * resizes) dominated startup.
 */

import { abilities as abilityList } from "~/modules/in-game-lists/abilities";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import { prepareAbilityTemplates } from "./detectors/death/abilities";
import { BURST_ICON_TEMPLATE_SIZES } from "./detectors/death/rois";
import { prepareMinimapAbilityTemplates } from "./detectors/minimap/abilities";
import {
	CARD_WEAPON_BACKGROUND,
	MINIMAP_WEAPON_INK_THRESHOLD,
	MINIMAP_WEAPON_TEMPLATE_SIZES,
	SPECIAL_READY_BACKGROUND,
	SPECIAL_READY_INK_THRESHOLD,
	SUB_TILE_TEMPLATE_SIZES,
} from "./detectors/minimap/rois";
import type { PlannerStage } from "./detectors/minimap/stage";
import {
	STRIP_WEAPON_INK_THRESHOLD,
	STRIP_WEAPON_TEMPLATE_BACKGROUND,
	STRIP_WEAPON_TEMPLATE_SIZES,
} from "./detectors/objective/rois";
import type { ScoreboardResources } from "./detectors/scoreboard/index";
import { prepareSpecialTemplates } from "./detectors/scoreboard/specials";
import { prepareWeaponTemplates } from "./detectors/scoreboard/weapons";
import { prepareOwnAbilityTemplates } from "./detectors/scoreboard-own/abilities";
import type { GlyphSet } from "./glyphs";
import type { FrameData } from "./image";

export interface ResourceIO {
	/** decoded RGBA of the shared game icon img/<dir>/<id>.avif */
	readIcon(dir: string, id: string): Promise<FrameData>;
	/** glyph atlas by name as a (possibly lazy) getter; () => null when absent */
	loadAtlas(name: string): Promise<() => GlyphSet | null>;
	/** planner signature atlas as a getter; () => null when absent */
	loadPlannerStages(): Promise<() => PlannerStage[] | null>;
}

/** resource key → atlas name under assets/cv/glyphs/ */
const ATLASES = {
	paintDigits: "scoreboard-paint-digits",
	statDigits: "scoreboard-stat-digits",
	teamDigits: "scoreboard-team-digits",
	nameGlyphs: "scoreboard-names",
	headerLobbyGlyphs: "scoreboard-header-lobby",
	headerLineGlyphs: "scoreboard-header-line",
	replayCodeGlyphs: "scoreboard-replay-code",
	replayResultGlyphs: "scoreboard-replay-result",
	deathWeaponGlyphs: "death-weapon",
	deathWeaponJaGlyphs: "death-weapon-ja",
	deathTagNameGlyphs: "death-tag-name",
	mapStartModeGlyphs: "map-start-mode",
	mapStartStageGlyphs: "map-start-stage",
} as const;

/** Memoize an expensive template/atlas build for the lazy resource getters. */
function lazy<T>(build: () => T): () => T {
	let value: T;
	let built = false;
	return () => {
		if (!built) {
			value = build();
			built = true;
		}
		return value;
	};
}

/** Requires loadOpenCV() to have resolved. */
export async function assembleScoreboardResources(
	io: ResourceIO,
): Promise<ScoreboardResources> {
	const icons = (dir: string, ids: readonly (number | string)[]) =>
		Promise.all(
			ids.map(async (id) => ({
				id: String(id),
				image: await io.readIcon(dir, String(id)),
			})),
		);

	const [
		weaponIcons,
		specialIcons,
		subIcons,
		abilityIcons,
		plannerStages,
		atlasEntries,
	] = await Promise.all([
		icons("main-weapons", mainWeaponIds),
		icons("special-weapons", specialWeaponIds),
		icons("sub-weapons", subWeaponIds),
		// UNKNOWN is the garbled-badge template: it competes in matching and
		// wins on unreadable slots (see toAbilityWithUnknown in scanner-types.ts)
		icons("abilities", [
			...abilityList.map((ability) => ability.name),
			"UNKNOWN",
		]),
		io.loadPlannerStages(),
		Promise.all(
			(Object.entries(ATLASES) as [keyof typeof ATLASES, string][]).map(
				async ([key, name]) => [key, await io.loadAtlas(name)] as const,
			),
		),
	]);
	const atlas = Object.fromEntries(atlasEntries) as Record<
		keyof typeof ATLASES,
		() => GlyphSet | null
	>;

	const weapons = lazy(() => prepareWeaponTemplates(weaponIcons));
	const deathBurstWeapons = lazy(() =>
		prepareWeaponTemplates(weaponIcons, BURST_ICON_TEMPLATE_SIZES),
	);
	const minimapCardWeapons = lazy(() =>
		prepareWeaponTemplates(weaponIcons, MINIMAP_WEAPON_TEMPLATE_SIZES, {
			background: CARD_WEAPON_BACKGROUND,
			inkThreshold: MINIMAP_WEAPON_INK_THRESHOLD,
			cropToArt: true,
		}),
	);
	const minimapLightWeapons = lazy(() =>
		prepareWeaponTemplates(weaponIcons, MINIMAP_WEAPON_TEMPLATE_SIZES, {
			background: SPECIAL_READY_BACKGROUND,
			inkThreshold: SPECIAL_READY_INK_THRESHOLD,
			cropToArt: true,
		}),
	);
	const stripWeapons = lazy(() =>
		prepareWeaponTemplates(weaponIcons, STRIP_WEAPON_TEMPLATE_SIZES, {
			background: STRIP_WEAPON_TEMPLATE_BACKGROUND,
			inkThreshold: STRIP_WEAPON_INK_THRESHOLD,
			cropToArt: true,
		}),
	);
	const specials = lazy(() => prepareSpecialTemplates(specialIcons));
	const minimapSubWeapons = lazy(() =>
		prepareSpecialTemplates(subIcons, SUB_TILE_TEMPLATE_SIZES),
	);
	const abilities = lazy(() => prepareAbilityTemplates(abilityIcons));
	const ownAbilities = lazy(() => prepareOwnAbilityTemplates(abilityIcons));
	const minimapAbilities = lazy(() =>
		prepareMinimapAbilityTemplates(abilityIcons),
	);

	return {
		get weapons() {
			return weapons();
		},
		get deathBurstWeapons() {
			return deathBurstWeapons();
		},
		get minimapCardWeapons() {
			return minimapCardWeapons();
		},
		get minimapLightWeapons() {
			return minimapLightWeapons();
		},
		get stripWeapons() {
			return stripWeapons();
		},
		get specials() {
			return specials();
		},
		get minimapSubWeapons() {
			return minimapSubWeapons();
		},
		get abilities() {
			return abilities();
		},
		get ownAbilities() {
			return ownAbilities();
		},
		get minimapAbilities() {
			return minimapAbilities();
		},
		get plannerStages() {
			return plannerStages();
		},
		get paintDigits() {
			return atlas.paintDigits();
		},
		get statDigits() {
			return atlas.statDigits();
		},
		get teamDigits() {
			return atlas.teamDigits();
		},
		get nameGlyphs() {
			return atlas.nameGlyphs();
		},
		get headerLobbyGlyphs() {
			return atlas.headerLobbyGlyphs();
		},
		get headerLineGlyphs() {
			return atlas.headerLineGlyphs();
		},
		get replayCodeGlyphs() {
			return atlas.replayCodeGlyphs();
		},
		get replayResultGlyphs() {
			return atlas.replayResultGlyphs();
		},
		get deathWeaponGlyphs() {
			return atlas.deathWeaponGlyphs();
		},
		get deathWeaponJaGlyphs() {
			return atlas.deathWeaponJaGlyphs();
		},
		get deathTagNameGlyphs() {
			return atlas.deathTagNameGlyphs();
		},
		get mapStartModeGlyphs() {
			return atlas.mapStartModeGlyphs();
		},
		get mapStartStageGlyphs() {
			return atlas.mapStartStageGlyphs();
		},
	};
}
