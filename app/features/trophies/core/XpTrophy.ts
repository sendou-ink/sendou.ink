import type {
	CameraSettings,
	ExtrasOptions,
	PicoCAD2ViewerState,
	RawGraphNode,
	RawPicoCAD2File,
} from "picocad2-web";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { toColor3 } from "./model-analysis";

const CODE_PREFIX = "xp-";
const PEDESTAL_FOLDER = "pedestal";

const MILESTONES = [
	{ value: 3000, folder: "30", effects: {} },
	{ value: 3200, folder: "32", effects: {} },
	{ value: 3500, folder: "35", effects: {} },
	{ value: 4000, folder: "40", effects: {} },
] as const satisfies ReadonlyArray<{
	value: number;
	folder: string;
	effects: ExtrasOptions;
}>;

const CAMERA: Omit<CameraSettings, "zoom"> = {
	omega: 0.02,
	theta: 0.03,
	distanceToTarget: 15.1,
	target: [0, 1.87, 0],
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
		if (node.name === category) return [shown(node)];
		if (node.name !== PEDESTAL_FOLDER) return [];

		return [
			{
				...node,
				visible: true,
				children: node.children.flatMap((child) => {
					if (otherMilestoneFolders.has(child.name)) return [];
					return [
						child.name === milestoneFolder?.folder ? shown(child) : child,
					];
				}),
			},
		];
	});

	const { texture } = master;

	return {
		source: { ...master, graph: { ...master.graph, children } },
		model: { camera: CAMERA },
		viewer: {
			backgroundColor: toColor3(texture.colors[texture.transparent_color]),
			transparency: "smooth",
		},
		extras: milestoneFolder?.effects ?? {},
	};
}

function shown(node: RawGraphNode): RawGraphNode {
	return { ...node, visible: true, children: node.children.map(shown) };
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
