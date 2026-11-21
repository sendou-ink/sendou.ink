// Range circles in the team's colour: around a living player's token when
// their radius is shown, around a thrown sub along with its owner's and
// always around a placed special.
// Plain Konva, no React.

import Konva from "konva";
import * as PlanCommands from "../core/PlanCommands";
import {
	type PlanDocument,
	type Point,
	type SlotIndex,
	teamOfSlot,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanKit from "../core/PlanKit";

const FILL_ALPHA = { reach: 0.16, blast: 0.08 };
const STROKE_ALPHA = 0.85;
/** Stroke width and dashes in screen pixels, whatever the zoom. */
const STROKE_WIDTH = 2;
const BLAST_DASH = [7, 5];

/** See {@link create}. */
export interface RadiusLayer {
	destroy: () => void;
}

interface Circle extends PlanKit.RangeCircle {
	center: Point;
	color: string;
}

/** Adds the range circles to `parent`, following the editor's plan. */
export function create({
	parent,
	editor,
}: {
	parent: Konva.Container;
	editor: PlanEditor;
}): RadiusLayer {
	let circles: Circle[] = [];
	const shape = new Konva.Shape({
		listening: false,
		sceneFunc: (context) => {
			const scale = shape.getAbsoluteScale().x;
			for (const circle of circles) {
				context.beginPath();
				context.arc(
					circle.center[0],
					circle.center[1],
					circle.radius,
					0,
					Math.PI * 2,
				);
				context.fillStyle = withAlpha(circle.color, FILL_ALPHA[circle.kind]);
				context.fill();
				context.setLineDash(
					circle.kind === "blast"
						? BLAST_DASH.map((length) => length / scale)
						: [],
				);
				context.lineWidth = STROKE_WIDTH / scale;
				context.strokeStyle = withAlpha(circle.color, STROKE_ALPHA);
				context.stroke();
			}
		},
	});
	parent.add(shape);

	const render = () => {
		circles = circlesOf(editor.getDocument());
		shape.getLayer()?.batchDraw();
	};

	const unsubscribe = editor.subscribe(render);
	render();

	return {
		destroy: () => {
			unsubscribe();
			shape.destroy();
		},
	};
}

function circlesOf(document: PlanDocument): Circle[] {
	const isRadiusShown = (slot: SlotIndex) =>
		Boolean(document.slots[slot]?.radiusShown);
	const colorOf = (slot: SlotIndex) => document.teams[teamOfSlot(slot)].color;

	const playerCircles = document.slots.flatMap((player, index) => {
		const slot = index as SlotIndex;
		if (
			!player?.position ||
			player.status === "dead" ||
			!PlanCommands.isOnMap(document, slot) ||
			!isRadiusShown(slot)
		) {
			return [];
		}

		return PlanKit.rangesOfPlayer(player).map((range) => ({
			...range,
			center: player.position!,
			color: colorOf(slot),
		}));
	});

	const markerCircles = document.markers.flatMap((marker) => {
		const owner = document.slots[marker.owner];
		if (!owner || (marker.kind === "sub" && !isRadiusShown(marker.owner))) {
			return [];
		}

		return PlanKit.rangesOfMarker(marker, owner).map((range) => ({
			...range,
			center: marker.position,
			color: colorOf(marker.owner),
		}));
	});

	return [...playerCircles, ...markerCircles];
}

function withAlpha(hexColor: string, alpha: number) {
	const value = Number.parseInt(hexColor.slice(1), 16);

	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
