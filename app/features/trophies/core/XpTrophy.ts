import type {
	CameraSettings,
	ExtrasOptions,
	PicoCAD2ViewerState,
	RawPicoCAD2File,
} from "picocad2-web";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { toColor3 } from "./model-analysis";

const CODE_PREFIX = "xp-";
const PEDESTAL_FOLDER = "pedestal";

const SHARED_EFFECTS: ExtrasOptions = {
	specular: {
		enabled: true,
		environment: {
			strength: 0.2,
			skyColor: [1, 1, 1],
			groundColor: [0, 0, 0],
			horizon: 0.6,
			fresnel: 0.73,
		},
		style: "smooth",
		nodes: ["pedestal", "rod.1", "rod.2", "rod.3", "rod.4"],
	},
	gradientOutline: {
		enabled: true,
		colorFrom: [0.04, 0.04, 0.04],
		gradient: 0,
		mode: "dropShadow",
	},
};

const THREE_POINT_TWO_THOUSAND_EFFECTS: ExtrasOptions = {
	meshDeform: {
		enabled: true,
		nodes: ["hundreds", "tens", "30", "32", "35", "40"],
		cycle: {
			enabled: true,
			mode: "loop",
			hold: 0,
		},
		sweep: {
			mode: "directional",
			direction: [0, 0, 1],
			softness: 0.2,
			wave: 0.4,
		},
		spherify: {
			amount: 0.15,
		},
	},
};

const THREE_POINT_FIVE_THOUSAND_EFFECTS: ExtrasOptions = {
	...THREE_POINT_TWO_THOUSAND_EFFECTS,
	triangleShatter: {
		enabled: true,
		cycle: {
			enabled: true,
			mode: "loop",
			duration: 8,
			hold: 1,
		},
		sweep: {
			mode: "directional",
			softness: 0.2,
			wave: 0.3,
		},
		distance: 2.5,
		spread: 0.75,
		rotation: 0.5,
		shrink: 1,
		nodes: [
			"HEAVY",
			"Charger.1",
			"RollerModel",
			"Shooter.1",
			"DualiesUNO",
			"DualiesDOS",
			"sword",
			"Bow",
			"deflect the rain",
			"EXPLOSION",
			"BUCKET",
			"ihatethisweapon",
		],
	},
};

const FOUR_THOUSAND_EFFECTS: ExtrasOptions = {
	...THREE_POINT_FIVE_THOUSAND_EFFECTS,
	interior: {
		enabled: true,
		pattern: "constellations",
		depth: 6,
		scale: 0.9,
		speed: 0.75,
		backgroundColor: [
			0.1411764705882353, 0.1411764705882353, 0.1411764705882353,
		],
		style: "smooth",
		maskedColors: [3, 1, 5],
		nodes: [
			"basebot",
			"chargers",
			"rollers",
			"shooters",
			"dualies",
			"splatlings",
			"splatanas",
			"stringers",
			"brellas",
			"blasters",
			"sloshers",
			"brushes",
		],
	},
	bloom: {
		enabled: true,
		threshold: 0.65,
		intensity: 1.71,
		blur: 1.77,
		maskedColors: [3, 5, 1],
	},
};

const TARGET_PER_CATEGORY = {
	blasters: { distance: 16.1, position: [0, 2.1, 0] },
	brellas: { distance: 17.1, position: [0, 2.3, 0] },
	brushes: { distance: 19.1, position: [0, 3, 0] },
	chargers: { distance: 16.1, position: [0, 2.1, 0] },
	dualies: { distance: 16.1, position: [0, 2.1, 0] },
	rollers: { distance: 17.8, position: [0, 2.6, 0] },
	shooters: { distance: 16.1, position: [0, 2.1, 0] },
	sloshers: { distance: 16.1, position: [0, 2.1, 0] },
	splatanas: { distance: 18.1, position: [0, 2.5, 0] },
	splatlings: { distance: 16.1, position: [0, 2.1, 0] },
	stringers: { distance: 17.1, position: [0, 2.2, 0] },
} satisfies Record<
	Category,
	{ distance: number; position: CameraSettings["target"] }
>;

const MILESTONES = [
	{ value: 3000, folder: "30", effects: { ...SHARED_EFFECTS } },
	{
		value: 3200,
		folder: "32",
		effects: { ...SHARED_EFFECTS, ...THREE_POINT_TWO_THOUSAND_EFFECTS },
	},
	{
		value: 3500,
		folder: "35",
		effects: { ...SHARED_EFFECTS, ...THREE_POINT_FIVE_THOUSAND_EFFECTS },
	},
	{
		value: 4000,
		folder: "40",
		effects: { ...SHARED_EFFECTS, ...FOUR_THOUSAND_EFFECTS },
	},
] as const satisfies ReadonlyArray<{
	value: number;
	folder: string;
	effects: ExtrasOptions;
}>;

const CAMERA: Pick<CameraSettings, "omega" | "theta"> = {
	omega: 0.02,
	theta: 0.03,
};

type Milestone = (typeof MILESTONES)[number]["value"];
type Category = Lowercase<(typeof weaponCategories)[number]["name"]>;

export interface Variant {
	category: Category;
	milestone: Milestone;
}

// Every possible variant
export const VARIANTS: ReadonlyArray<Variant & { code: string; name: string }> =
	weaponCategories.flatMap(({ name }) =>
		MILESTONES.map(({ value }) => {
			const variant = { category: toCategory(name), milestone: value };
			return { ...variant, code: code(variant), name: variantName(variant) };
		}),
	);

export function code({ category, milestone }: Variant) {
	return `${CODE_PREFIX}${category}-${milestone}`;
}

// This is just for SQL "like" queries
export const CODE_LIKE_PATTERN = `${CODE_PREFIX}%`;

export function parseCode(trophyCode: string | null | undefined) {
	if (!trophyCode) return null;

	return VARIANTS.find((variant) => variant.code === trophyCode) ?? null;
}

export function categoryKey(category: Category) {
	return category.toUpperCase() as Uppercase<Category>;
}

export function milestoneFor(power: number) {
	return (
		MILESTONES.findLast((milestone) => power >= milestone.value)?.value ?? null
	);
}

export function categoryWeaponIds(category: Category): readonly MainWeaponId[] {
	return (
		weaponCategories.find(({ name }) => toCategory(name) === category)
			?.weaponIds ?? []
	);
}

export function awards(
	placements: ReadonlyArray<{
		userId: number;
		weaponSplId: MainWeaponId;
		power: number;
	}>,
) {
	const peaks = new Map<
		string,
		{ userId: number; category: Category; power: number }
	>();

	for (const { userId, weaponSplId, power } of placements) {
		const category = weaponCategory(weaponSplId);
		if (!category) continue;

		const key = `${userId}-${category}`;
		const peak = peaks.get(key);
		if (!peak || power > peak.power) {
			peaks.set(key, { userId, category, power });
		}
	}

	return [...peaks.values()].flatMap(({ userId, category, power }) => {
		const milestone = milestoneFor(power);
		return milestone ? [{ userId, code: code({ category, milestone }) }] : [];
	});
}

export function division(
	placements: ReadonlyArray<{
		weaponSplId: MainWeaponId;
		power: number;
		region: XRankPlacementRegion;
	}>,
	{ category, milestone }: Variant,
): XRankPlacementRegion | null {
	const weaponIds: readonly number[] = categoryWeaponIds(category);
	const regions = new Set(
		placements
			.filter(
				(placement) =>
					weaponIds.includes(placement.weaponSplId) &&
					placement.power >= milestone,
			)
			.map((placement) => placement.region),
	);

	if (regions.has("JPN")) return "JPN";
	if (regions.has("WEST")) return "WEST";
	return null;
}

export function variantState(
	master: RawPicoCAD2File,
	{ category, milestone }: Variant,
): PicoCAD2ViewerState {
	const milestoneFolder = MILESTONES.find(
		(candidate) => candidate.value === milestone,
	);
	const otherMilestoneFolders = new Set<string>(
		MILESTONES.filter((candidate) => candidate !== milestoneFolder).map(
			(candidate) => candidate.folder,
		),
	);

	const children = master.graph.children.flatMap((node) => {
		if (node.name === category) return [node];
		if (node.name !== PEDESTAL_FOLDER) return [];

		return [
			{
				...node,
				children: node.children.filter(
					(child) => !otherMilestoneFolders.has(child.name),
				),
			},
		];
	});

	const { texture } = master;

	return {
		source: { ...master, graph: { ...master.graph, children } },
		model: {
			camera: {
				...CAMERA,
				distanceToTarget: TARGET_PER_CATEGORY[category].distance,
				target: TARGET_PER_CATEGORY[category].position,
			},
		},
		viewer: {
			backgroundColor: toColor3(texture.colors[texture.transparent_color]),
			transparency: "smooth",
		},
		extras: milestoneFolder?.effects ?? {},
	};
}

function weaponCategory(weaponSplId: MainWeaponId) {
	const category = weaponCategories.find(({ weaponIds }) =>
		(weaponIds as readonly number[]).includes(weaponSplId),
	);

	return category ? toCategory(category.name) : null;
}

function toCategory(name: (typeof weaponCategories)[number]["name"]) {
	return name.toLowerCase() as Category;
}

function variantName({ category, milestone }: Variant) {
	return `${milestone} X Power ${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}
