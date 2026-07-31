import type { Color3, ExtrasOptions, ViewerSettings } from "picocad2-web";

export interface TrophyModelAnalysis {
	cameraTargetCentered: boolean;
	backgroundIsAlpha: boolean;
	drawCalls: number;
	polyCount: number;
	effectsCount: number;
}

type RawColor = Array<number> | { r: number; g: number; b: number };

interface RawFace {
	vertex_ids: Array<number>;
	dbl?: boolean;
	prio?: boolean;
}

interface RawGraphNode {
	visible: boolean;
	children: Array<RawGraphNode>;
	mesh?: { faces: Array<RawFace> };
}

interface ModelState {
	source: {
		graph: RawGraphNode;
		texture: {
			colors: Array<RawColor>;
			background_color: number;
			transparent_color: number;
		};
	};
	settings: ViewerSettings;
	extras?: ExtrasOptions;
}

export function analyzeTrophyModel(model: string): TrophyModelAnalysis | null {
	try {
		const state: ModelState = JSON.parse(model);

		return {
			cameraTargetCentered: isCameraTargetCentered(state),
			backgroundIsAlpha: isBackgroundAlpha(state),
			...countGeometry(state),
			effectsCount: countEnabledEffects(state),
		};
	} catch {
		return null;
	}
}

function isCameraTargetCentered(state: ModelState) {
	const target = state.settings.camera.target;
	return target[0] === 0 && target[2] === 0;
}

function isBackgroundAlpha(state: ModelState) {
	const texture = state.source.texture;
	const transparent = toColor3(texture.colors[texture.transparent_color]);
	const background =
		state.settings.backgroundColor ??
		toColor3(texture.colors[texture.background_color]);

	return (
		background[0] === transparent[0] &&
		background[1] === transparent[1] &&
		background[2] === transparent[2]
	);
}

function toColor3(color: RawColor): Color3 {
	return Array.isArray(color)
		? [color[0], color[1], color[2]]
		: [color.r, color.g, color.b];
}

function countGeometry(state: ModelState) {
	const counts = { drawCalls: 0, polyCount: 0 };

	const visit = (node: RawGraphNode, parentVisible: boolean) => {
		for (const child of node.children) {
			const visible = Boolean(child.visible) && parentVisible;

			if (visible && child.mesh) {
				const groups = new Set<number>();

				for (const face of child.mesh.faces) {
					if (face.vertex_ids.length < 3) continue;

					groups.add((face.dbl ? 1 : 0) | (face.prio ? 2 : 0));
					counts.polyCount += face.vertex_ids.length - 2;
				}

				counts.drawCalls += groups.size;
			}

			visit(child, visible);
		}
	};
	visit(state.source.graph, true);

	return counts;
}

function countEnabledEffects(state: ModelState) {
	return Object.values(state.extras ?? {}).filter(
		(effect) => effect?.enabled === true,
	).length;
}
