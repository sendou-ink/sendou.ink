import * as PlanDocument from "../core/PlanDocument";

const LABELS = [
	"Sendou",
	"Kiver",
	"Lean",
	"ZebraPlays",
	"Brian",
	"Toxic Bubble",
	"Jay",
	"yaoi",
] as const;

const WEAPON_IDS = [40, 1010, 2070, 7010, 210, 310, 4020, 8000] as const;

/**
 * A plan as one would be after a few minutes of planning: every slot filled and placed, a
 * few thrown subs, strokes and arrows, a text, some ink of both teams and a zone taken.
 * Coordinates are whole pixels and strokes are already simplified, so it round trips exactly.
 */
export function typicalPlan(): PlanDocument.PlanDocument {
	const plan = PlanDocument.empty({ stageId: 9, mode: "SZ" });

	plan.slots = WEAPON_IDS.map((weaponId, slot) => ({
		...PlanDocument.newPlayer(weaponId),
		label: LABELS[slot],
		position: [
			slot < 4 ? 400 + slot * 60 : 1400 + slot * 40,
			300 + slot * 70,
		] as PlanDocument.Point,
		status: slot === 6 ? ("dead" as const) : ("normal" as const),
		radiusShown: slot === 0,
		specialActive: slot === 5,
	}));

	plan.markers = [
		{ id: "mrk00001", kind: "sub", owner: 0, position: [520, 410] },
		{ id: "mrk00002", kind: "sub", owner: 4, position: [1380, 600] },
		{ id: "mrk00003", kind: "special", owner: 5, position: [1250, 520] },
	];

	plan.drawings = [
		...Array.from({ length: 6 }, (_, index) =>
			handDrawnStroke(`stroke0${index}`, 300 + index * 200, 200 + index * 90),
		),
		...Array.from(
			{ length: 4 },
			(_, index): PlanDocument.PlanDrawing => ({
				id: `arrow00${index}`,
				type: "arrow",
				color: "#ff4d4d",
				size: "M",
				from: [700 + index * 100, 800],
				to: [900 + index * 80, 500 - index * 30],
			}),
		),
		{
			id: "rect0001",
			type: "rectangle",
			color: "#ffffff",
			size: "S",
			from: [880, 420],
			to: [1040, 560],
		},
		{
			id: "text0001",
			type: "text",
			color: "#ffffff",
			size: "L",
			position: [900, 380],
			text: "push left after the wipe",
		},
	];

	plan.ink = inkWithBlobs([
		{ center: [500, 450], radius: 160, value: 1 },
		{ center: [900, 600], radius: 120, value: 1 },
		{ center: [1400, 500], radius: 180, value: 2 },
	]);

	plan.objective = { mode: "SZ", zones: { "0": 0 } };

	return plan;
}

/** Ink of the given circles, later circles painted over earlier ones. */
export function inkWithBlobs(
	blobs: Array<{
		center: PlanDocument.Point;
		radius: number;
		value: PlanDocument.InkCell;
	}>,
) {
	const { columns, rows } = PlanDocument.INK_GRID;
	const ink: PlanDocument.InkCell[] = [];

	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const x = (column + 0.5) * PlanDocument.INK_CELL_SIZE;
			const y = (row + 0.5) * PlanDocument.INK_CELL_SIZE;
			const blob = blobs.findLast(
				({ center, radius }) =>
					Math.hypot(center[0] - x, center[1] - y) <= radius,
			);
			ink.push(blob?.value ?? 0);
		}
	}

	return ink;
}

function handDrawnStroke(
	id: string,
	startX: number,
	startY: number,
): PlanDocument.StrokeDrawing {
	return {
		id,
		type: "stroke",
		color: "#ffffff",
		size: "M",
		points: Array.from({ length: 24 }, (_, index) => [
			startX + index * 12,
			startY + Math.round(index * 4 + (index % 2 === 0 ? 8 : -8)),
		]),
	};
}
