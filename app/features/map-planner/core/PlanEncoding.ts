// The plan as stored in files, the browser and the URL: JSON with short keys,
// defaults left out, coordinates rounded to whole map pixels, strokes
// simplified and the ink grid run-length encoded. The URL form is the same
// JSON deflated into base64url. Decoding validates everything and turns away
// anything that isn't a plan of a version this code knows.

import * as R from "remeda";
import * as v from "valibot";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { compressToBase64, decompressFromBase64 } from "~/utils/compression";
import { modeShort, numericEnum } from "~/utils/schema";
import {
	DEFAULT_TEAM_COLORS,
	DRAWING_SIZES,
	DRAWING_TEXT_MAX_LENGTH,
	INK_GRID,
	type InkCell,
	MAP_VARIANTS,
	PLAYER_LABEL_MAX_LENGTH,
	PLAYER_STATUSES,
	type PlanDocument,
	type PlanDrawing,
	type PlanObjective,
	type PlanPlayer,
	type Point,
	type RainmakerState,
	SLOTS_PER_TEAM,
	type SpanDrawing,
	type TeamIndex,
} from "./PlanDocument";

/** Bumped on every change old code couldn't read; decoding an older version would migrate it. */
export const PLAN_FORMAT_VERSION = 1;

/** Decompression bomb guard for plans from URLs. */
const MAX_DECOMPRESSED_BYTES = 2_000_000;

/** Stroke points closer than this (map pixels) to the simplified line are dropped. */
const STROKE_SIMPLIFY_TOLERANCE = 1;

const MAX_DRAWINGS = 2_000;
const MAX_MARKERS = 200;
const MAX_STROKE_POINTS = 5_000;
const MAX_ID_LENGTH = 32;

const PLAYER_FLAGS = {
	specialActive: 1,
	radiusShown: 2,
	hidden: 4,
} as const;

const DRAWING_TYPE_KEYS = {
	stroke: "s",
	arrow: "a",
	line: "l",
	rectangle: "r",
	ellipse: "e",
	text: "x",
} as const satisfies Record<PlanDrawing["type"], string>;

const INK_RUN_VALUES = ["N", "A", "B"] as const;

const DEFAULT_DRAWING_SIZE = "M";

/** Keys of the stored objective (`o`) each mode may have. */
const OBJECTIVE_KEYS = {
	TW: [],
	SZ: ["z"],
	TC: ["c", "t"],
	RM: ["c", "r"],
	CB: ["b"],
} as const satisfies Record<PlanObjective["mode"], string[]>;

/** Stands in for a drawing colour that isn't `#rrggbb`. */
const FALLBACK_DRAWING_COLOR = "#ffffff";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID_LENGTH));
const coordinate = v.pipe(v.number(), v.integer());
const storedPoint = v.tuple([coordinate, coordinate]);
const color = v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/));
const slotIndex = numericEnum([0, 1, 2, 3, 4, 5, 6, 7] as const);
const teamIndex = numericEnum([0, 1] as const);
const drawingStyle = {
	i: id,
	c: color,
	z: v.optional(v.picklist(DRAWING_SIZES)),
};

const storedPlayerSchema = v.object({
	w: numericEnum(mainWeaponIds),
	l: v.optional(v.pipe(v.string(), v.maxLength(PLAYER_LABEL_MAX_LENGTH))),
	/** index of {@link PLAYER_STATUSES} */
	s: v.optional(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(0),
			v.maxValue(PLAYER_STATUSES.length - 1),
		),
	),
	/** {@link PLAYER_FLAGS} */
	f: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(7))),
	p: v.optional(storedPoint),
});

const storedDrawingSchema = v.variant("t", [
	v.object({
		...drawingStyle,
		t: v.literal(DRAWING_TYPE_KEYS.stroke),
		/** x and y of each point in turn */
		p: v.pipe(
			v.array(coordinate),
			v.minLength(2),
			v.maxLength(MAX_STROKE_POINTS * 2),
			v.check((coordinates) => coordinates.length % 2 === 0),
		),
	}),
	v.object({
		...drawingStyle,
		t: v.picklist([
			DRAWING_TYPE_KEYS.arrow,
			DRAWING_TYPE_KEYS.line,
			DRAWING_TYPE_KEYS.rectangle,
			DRAWING_TYPE_KEYS.ellipse,
		]),
		/** from x, from y, to x, to y */
		p: v.tuple([coordinate, coordinate, coordinate, coordinate]),
	}),
	v.object({
		...drawingStyle,
		t: v.literal(DRAWING_TYPE_KEYS.text),
		p: storedPoint,
		x: v.pipe(v.string(), v.maxLength(DRAWING_TEXT_MAX_LENGTH)),
	}),
]);

const storedPlanObjectSchema = v.object({
	v: v.literal(PLAN_FORMAT_VERSION),
	s: numericEnum(stageIds),
	m: modeShort,
	/** map variant, left out for the standard layout */
	a: v.optional(v.picklist(MAP_VARIANTS)),
	/** team colours, left out when the defaults */
	c: v.optional(v.tuple([color, color])),
	/** slots, `0` for an empty one */
	p: v.pipe(
		v.array(v.union([v.literal(0), storedPlayerSchema])),
		v.length(SLOTS_PER_TEAM * 2),
	),
	k: v.optional(
		v.pipe(
			v.array(
				v.object({
					i: id,
					/** 0 = sub, 1 = special */
					t: numericEnum([0, 1] as const),
					o: slotIndex,
					p: storedPoint,
				}),
			),
			v.maxLength(MAX_MARKERS),
		),
	),
	d: v.optional(
		v.pipe(v.array(storedDrawingSchema), v.maxLength(MAX_DRAWINGS)),
	),
	/** ink runs, see {@link encodeInk} */
	i: v.optional(v.string()),
	o: v.optional(
		v.object({
			z: v.optional(v.record(id, teamIndex)),
			c: v.optional(v.array(id)),
			/** the team whose basket is open */
			b: v.optional(teamIndex),
			t: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
			/** dropped at a point or carried by the player of a slot */
			r: v.optional(v.union([storedPoint, slotIndex])),
		}),
	),
});

const storedPlanSchema = v.pipe(
	storedPlanObjectSchema,
	v.check(
		(stored) => hasUniqueIds(stored.k ?? []) && hasUniqueIds(stored.d ?? []),
		"Duplicate ids",
	),
	v.check(
		(stored) =>
			Object.keys(stored.o ?? {}).every((key) =>
				(OBJECTIVE_KEYS[stored.m] as readonly string[]).includes(key),
			),
		"Objective state of another mode",
	),
	v.rawTransform(({ dataset, addIssue, NEVER }) => {
		const ink = decodeInk(dataset.value.i ?? "");
		if (!ink) {
			addIssue({ message: "Invalid ink" });
			return NEVER;
		}

		return toDocument(dataset.value, ink);
	}),
);

type StoredPlan = v.InferOutput<typeof storedPlanObjectSchema>;
type StoredPlayer = v.InferOutput<typeof storedPlayerSchema>;
type StoredDrawing = v.InferOutput<typeof storedDrawingSchema>;

/** A decoded plan, or why there is none: not a plan at all, or one of a version this code can't read. */
export type DecodeResult =
	| { ok: true; document: PlanDocument }
	| { ok: false; error: "invalid" | "unsupportedVersion" };

/**
 * The plan as JSON text, the contents of a plan file. Always something {@link decode} accepts:
 * values past the format's limits are cut to them (labels, texts, counts) or left out (empty
 * strokes, malformed ids), so one bad value can't make the whole plan unreadable.
 */
export function encode(document: PlanDocument) {
	return JSON.stringify(toStored(document));
}

/** Reads a plan from JSON text made by {@link encode}. */
export function decode(text: string): DecodeResult {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return { ok: false, error: "invalid" };
	}

	return fromStored(json);
}

/** The plan compressed into a base64url string to go in a URL. */
export function toUrlParam(document: PlanDocument) {
	return compressToBase64(encode(document), { urlSafe: true });
}

/** Reads a plan from a string made by {@link toUrlParam}. */
export function fromUrlParam(value: string): DecodeResult {
	const text = decompressFromBase64(value, {
		maxDecompressedBytes: MAX_DECOMPRESSED_BYTES,
	});
	if (!text) return { ok: false, error: "invalid" };

	return decode(text);
}

function fromStored(json: unknown): DecodeResult {
	if (
		R.isPlainObject(json) &&
		typeof json.v === "number" &&
		json.v !== PLAN_FORMAT_VERSION
	) {
		return { ok: false, error: "unsupportedVersion" };
	}

	const result = v.safeParse(storedPlanSchema, json);
	if (!result.success) return { ok: false, error: "invalid" };

	return { ok: true, document: result.output };
}

function toStored(document: PlanDocument): StoredPlan {
	const stored: StoredPlan = {
		v: PLAN_FORMAT_VERSION,
		s: document.stageId,
		m: document.objective.mode,
		p: document.slots.map((player) => (player ? toStoredPlayer(player) : 0)),
	};

	if (document.variant) stored.a = document.variant;

	const teamColors = [
		normalizedColor(document.teams[0].color, DEFAULT_TEAM_COLORS[0]),
		normalizedColor(document.teams[1].color, DEFAULT_TEAM_COLORS[1]),
	] as [string, string];
	if (
		teamColors[0] !== DEFAULT_TEAM_COLORS[0] ||
		teamColors[1] !== DEFAULT_TEAM_COLORS[1]
	) {
		stored.c = teamColors;
	}

	const markers = document.markers
		.filter((marker) => v.is(id, marker.id))
		.slice(0, MAX_MARKERS);
	if (markers.length > 0) {
		stored.k = markers.map((marker) => ({
			i: marker.id,
			t: marker.kind === "sub" ? 0 : 1,
			o: marker.owner,
			p: roundPoint(marker.position),
		}));
	}

	const drawings = document.drawings
		.filter(
			(drawing) =>
				v.is(id, drawing.id) &&
				(drawing.type !== "stroke" || drawing.points.length > 0),
		)
		.slice(0, MAX_DRAWINGS);
	if (drawings.length > 0) {
		stored.d = drawings.map(toStoredDrawing);
	}

	const ink = encodeInk(document.ink);
	if (ink) stored.i = ink;

	const objective = toStoredObjective(document.objective);
	if (!R.isEmpty(objective)) stored.o = objective;

	return stored;
}

function toStoredPlayer(player: PlanPlayer): StoredPlayer {
	const stored: StoredPlayer = { w: player.weaponId };

	const label = player.label.slice(0, PLAYER_LABEL_MAX_LENGTH);
	if (label) stored.l = label;

	const status = PLAYER_STATUSES.indexOf(player.status);
	if (status > 0) stored.s = status;

	let flags = 0;
	for (const [key, flag] of R.entries(PLAYER_FLAGS)) {
		if (player[key]) flags |= flag;
	}
	if (flags) stored.f = flags;

	if (player.position) stored.p = roundPoint(player.position);

	return stored;
}

function toStoredDrawing(drawing: PlanDrawing): StoredDrawing {
	const style = {
		i: drawing.id,
		c: normalizedColor(drawing.color, FALLBACK_DRAWING_COLOR),
		...(drawing.size !== DEFAULT_DRAWING_SIZE ? { z: drawing.size } : {}),
	};

	switch (drawing.type) {
		case "stroke":
			return {
				...style,
				t: DRAWING_TYPE_KEYS.stroke,
				p: simplifyStroke(drawing.points.map(roundPoint))
					.slice(0, MAX_STROKE_POINTS)
					.flat(),
			};
		case "text":
			return {
				...style,
				t: DRAWING_TYPE_KEYS.text,
				p: roundPoint(drawing.position),
				x: drawing.text.slice(0, DRAWING_TEXT_MAX_LENGTH),
			};
		default:
			return {
				...style,
				t: DRAWING_TYPE_KEYS[drawing.type],
				p: [...roundPoint(drawing.from), ...roundPoint(drawing.to)],
			};
	}
}

function toStoredObjective(objective: PlanObjective) {
	const stored: NonNullable<StoredPlan["o"]> = {};

	if (objective.mode === "SZ") {
		const zones = R.pickBy(objective.zones, (_, zoneId) => v.is(id, zoneId));
		if (!R.isEmpty(zones)) stored.z = zones;
	}
	if (objective.mode === "TC" || objective.mode === "RM") {
		const clearedCheckpoints = objective.clearedCheckpoints.filter(
			(checkpointId) => v.is(id, checkpointId),
		);
		if (clearedCheckpoints.length > 0) stored.c = clearedCheckpoints;
	}
	if (objective.mode === "TC" && objective.tower !== null) {
		stored.t = R.clamp(Math.round(objective.tower * 1000) / 1000, {
			min: 0,
			max: 1,
		});
	}
	if (objective.mode === "RM" && objective.rainmaker) {
		stored.r =
			"carrier" in objective.rainmaker
				? objective.rainmaker.carrier
				: roundPoint(objective.rainmaker.position);
	}
	if (objective.mode === "CB" && objective.openBasket !== null) {
		stored.b = objective.openBasket;
	}

	return stored;
}

function toDocument(stored: StoredPlan, ink: InkCell[]): PlanDocument {
	return {
		stageId: stored.s,
		...(stored.a ? { variant: stored.a } : {}),
		teams: [
			{ color: stored.c?.[0] ?? DEFAULT_TEAM_COLORS[0] },
			{ color: stored.c?.[1] ?? DEFAULT_TEAM_COLORS[1] },
		],
		slots: stored.p.map((player) => (player === 0 ? null : toPlayer(player))),
		markers: (stored.k ?? []).map((marker) => ({
			id: marker.i,
			kind: marker.t === 0 ? "sub" : "special",
			owner: marker.o,
			position: marker.p,
		})),
		drawings: (stored.d ?? []).map(toDrawing),
		ink,
		objective: toObjective(stored.m, stored.o ?? {}),
	};
}

function toObjective(
	mode: StoredPlan["m"],
	stored: NonNullable<StoredPlan["o"]>,
): PlanObjective {
	switch (mode) {
		case "TW":
			return { mode };
		case "SZ":
			return { mode, zones: (stored.z ?? {}) as Record<string, TeamIndex> };
		case "TC":
			return {
				mode,
				clearedCheckpoints: stored.c ?? [],
				tower: stored.t ?? null,
			};
		case "RM":
			return {
				mode,
				clearedCheckpoints: stored.c ?? [],
				rainmaker: toRainmaker(stored.r),
			};
		case "CB":
			return { mode, openBasket: stored.b ?? null };
	}
}

function toPlayer(stored: StoredPlayer): PlanPlayer {
	const flags = stored.f ?? 0;

	return {
		weaponId: stored.w,
		label: stored.l ?? "",
		status: PLAYER_STATUSES[stored.s ?? 0],
		specialActive: Boolean(flags & PLAYER_FLAGS.specialActive),
		radiusShown: Boolean(flags & PLAYER_FLAGS.radiusShown),
		hidden: Boolean(flags & PLAYER_FLAGS.hidden),
		position: stored.p ?? null,
	};
}

function toDrawing(stored: StoredDrawing): PlanDrawing {
	const style = {
		id: stored.i,
		color: stored.c,
		size: stored.z ?? DEFAULT_DRAWING_SIZE,
	};

	switch (stored.t) {
		case DRAWING_TYPE_KEYS.stroke:
			return {
				...style,
				type: "stroke",
				points: R.chunk(stored.p, 2) as Point[],
			};
		case DRAWING_TYPE_KEYS.text:
			return { ...style, type: "text", position: stored.p, text: stored.x };
		default: {
			const type = R.keys(DRAWING_TYPE_KEYS).find(
				(key) => DRAWING_TYPE_KEYS[key] === stored.t,
			) as SpanDrawing["type"];
			const [fromX, fromY, toX, toY] = stored.p;

			return { ...style, type, from: [fromX, fromY], to: [toX, toY] };
		}
	}
}

function toRainmaker(
	stored: NonNullable<StoredPlan["o"]>["r"],
): RainmakerState {
	if (stored === undefined) return null;
	if (typeof stored === "number") return { carrier: stored };

	return { position: stored };
}

/**
 * Runs of equal cells as the value's letter (`N`, `A`, `B`) followed by the run's length in
 * base 36, left out when 1. The neutral run at the end is left out, so a blank grid is `""`.
 */
function encodeInk(ink: InkCell[]) {
	let result = "";
	let index = 0;

	while (index < ink.length) {
		const value = ink[index];
		let end = index + 1;
		while (end < ink.length && ink[end] === value) end++;

		if (value !== 0 || end < ink.length) {
			const length = end - index;
			result += INK_RUN_VALUES[value] + (length > 1 ? length.toString(36) : "");
		}
		index = end;
	}

	return result;
}

function decodeInk(encoded: string): InkCell[] | null {
	const cellCount = INK_GRID.columns * INK_GRID.rows;
	const ink: InkCell[] = [];

	for (const [, letter, length] of encoded.matchAll(/([NAB])([0-9a-z]*)/g)) {
		const value = INK_RUN_VALUES.indexOf(letter as "N") as InkCell;
		const count = length ? Number.parseInt(length, 36) : 1;
		if (ink.length + count > cellCount) return null;

		for (let i = 0; i < count; i++) ink.push(value);
	}

	const consumed = encoded.replace(/[NAB][0-9a-z]*/g, "");
	if (consumed !== "") return null;

	while (ink.length < cellCount) ink.push(0);

	return ink;
}

/** Ramer–Douglas–Peucker over the points with consecutive duplicates removed. */
function simplifyStroke(points: Point[]): Point[] {
	const deduplicated = points.filter(
		(point, index) =>
			index === 0 ||
			point[0] !== points[index - 1][0] ||
			point[1] !== points[index - 1][1],
	);
	if (deduplicated.length <= 2) return deduplicated;

	const keep = new Array<boolean>(deduplicated.length).fill(false);
	keep[0] = true;
	keep[deduplicated.length - 1] = true;

	const ranges: Array<[number, number]> = [[0, deduplicated.length - 1]];
	while (ranges.length > 0) {
		const [start, end] = ranges.pop()!;
		let farthestIndex = -1;
		let farthestDistance = STROKE_SIMPLIFY_TOLERANCE;

		for (let i = start + 1; i < end; i++) {
			const distance = distanceToSegment(
				deduplicated[i],
				deduplicated[start],
				deduplicated[end],
			);
			if (distance > farthestDistance) {
				farthestIndex = i;
				farthestDistance = distance;
			}
		}

		if (farthestIndex !== -1) {
			keep[farthestIndex] = true;
			ranges.push([start, farthestIndex], [farthestIndex, end]);
		}
	}

	return deduplicated.filter((_, index) => keep[index]);
}

function distanceToSegment(point: Point, start: Point, end: Point) {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	const lengthSquared = dx * dx + dy * dy;
	const t =
		lengthSquared === 0
			? 0
			: R.clamp(
					((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
						lengthSquared,
					{ min: 0, max: 1 },
				);

	return Math.hypot(
		point[0] - (start[0] + t * dx),
		point[1] - (start[1] + t * dy),
	);
}

function normalizedColor(value: string, fallback: string) {
	const lowercase = value.toLowerCase();

	return v.is(color, lowercase) ? lowercase : fallback;
}

function roundPoint(point: Point): Point {
	return [Math.round(point[0]), Math.round(point[1])];
}

function hasUniqueIds(items: Array<{ i: string }>) {
	return new Set(items.map((item) => item.i)).size === items.length;
}
