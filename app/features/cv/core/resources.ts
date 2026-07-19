/**
 * Environment-agnostic assembly of ScoreboardResources. Node (filesystem)
 * and the worker (HTTP) inject only the four IO primitives; every resource
 * key, icon directory, template option set, and atlas name lives here once,
 * so adding a resource cannot desync the two loaders.
 *
 * Icon/atlas decoding happens eagerly (cheap), but template preparation and
 * atlas slicing are deferred behind memoized getters: a test process loads
 * the full bundle while its one detector only ever touches a slice of it,
 * and the unused sets (four weapon-template builds alone are ~7k resizes)
 * dominated startup.
 */

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
import type { ScoreboardResources } from "./detectors/scoreboard/index";
import { prepareSpecialTemplates } from "./detectors/scoreboard/specials";
import { prepareWeaponTemplates } from "./detectors/scoreboard/weapons";
import { prepareOwnAbilityTemplates } from "./detectors/scoreboard-own/abilities";
import type { GlyphSet } from "./glyphs";
import type { FrameData } from "./image";

export interface ResourceIO {
	/** ids listed in <assets>/<dir>/manifest.json */
	readManifest(dir: string): Promise<string[]>;
	/** decoded RGBA of <assets>/<dir>/<id>.png */
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
	const icons = async (dir: string) => {
		const ids = await io.readManifest(dir);
		return Promise.all(
			ids.map(async (id) => ({ id, image: await io.readIcon(dir, id) })),
		);
	};

	const [
		weaponIcons,
		specialIcons,
		subIcons,
		abilityIcons,
		plannerStages,
		atlasEntries,
	] = await Promise.all([
		icons("main-weapons"),
		icons("specials"),
		icons("sub-weapons"),
		icons("abilities"),
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
