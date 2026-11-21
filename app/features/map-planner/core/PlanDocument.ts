// A plan: one board of a 4v4 game on one map. Positions are in map coordinates,
// i.e. pixels of the 1920×1080 map render, never screen pixels. Only what the
// user decided is stored: a weapon is its id, ranges, images and map data are
// derived when drawing.

import { nanoid } from "nanoid";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";

/** Width and height of the map render that map coordinates refer to. */
export const MAP_SIZE = { width: 1920, height: 1080 } as const;

/** Side of one ink cell in map coordinates. */
export const INK_CELL_SIZE = 20;

/** Ink grid columns and rows, covering the whole render. */
export const INK_GRID = {
	columns: MAP_SIZE.width / INK_CELL_SIZE,
	rows: MAP_SIZE.height / INK_CELL_SIZE,
} as const;

/** Player slots per team, slots `0–3` belong to team A and `4–7` to team B. */
export const SLOTS_PER_TEAM = 4;

/** A player is in exactly one of these, the toggles of {@link PlanPlayer} come on top. */
export const PLAYER_STATUSES = [
	"normal",
	"sharking",
	"jumping",
	"dead",
] as const;

/** Longest label shown under a token and in its slot. */
export const PLAYER_LABEL_MAX_LENGTH = 16;

/** Longest text label drawn on the map. */
export const DRAWING_TEXT_MAX_LENGTH = 200;

/** Stroke width or font size of a drawing, the pixels decided by the renderer. */
export const DRAWING_SIZES = ["S", "M", "L"] as const;

/** How far a text label can be shrunk or grown from its size's font. */
export const TEXT_SCALE_LIMITS = { min: 0.25, max: 8 } as const;

/** Default team colours: blue and yellow, a pair told apart with every kind of colour blindness. */
// XXX: take the pair from the game's ink colour pairs (`BROADCAST_INK_COLORS` of the broadcast feature), one fixed pair or rotating per plan
export const DEFAULT_TEAM_COLORS = ["#3d63f5", "#f5c518"] as const;

/** A position in map coordinates. */
export type Point = [x: number, y: number];

/** `0` team A, `1` team B. */
export type TeamIndex = 0 | 1;

/** Index into {@link PlanDocument.slots}, `0–3` team A, `4–7` team B. */
export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** See {@link PLAYER_STATUSES}. */
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** See {@link DRAWING_SIZES}. */
export type DrawingSize = (typeof DRAWING_SIZES)[number];

/** `null` neutral, otherwise the team owning it. */
export type Owner = TeamIndex | null;

/** What a team looks like, its players being slots of {@link PlanDocument.slots}. */
export interface PlanTeam {
	/** `#rrggbb` */
	color: string;
}

/** The player of one slot and their token. */
export interface PlanPlayer {
	/** The kit, alt kits being weapons of their own. */
	weaponId: MainWeaponId;
	label: string;
	status: PlayerStatus;
	specialActive: boolean;
	radiusShown: boolean;
	/** Off the map but still in the slot, keeping its position for when it is shown again. */
	hidden: boolean;
	/** `null` while not yet placed on the map. */
	position: Point | null;
}

/** A thrown sub or a placed special of the player in slot `owner`, the weapon read from the player's kit. */
export interface PlanMarker {
	id: string;
	kind: "sub" | "special";
	owner: SlotIndex;
	position: Point;
}

interface DrawingBase {
	id: string;
	/** `#rrggbb` */
	color: string;
	size: DrawingSize;
}

/** A freehand pen stroke. */
export interface StrokeDrawing extends DrawingBase {
	type: "stroke";
	points: Point[];
}

/** Arrow, line, rectangle and ellipse are all spanned by two corners. */
export interface SpanDrawing extends DrawingBase {
	type: "arrow" | "line" | "rectangle" | "ellipse";
	from: Point;
	to: Point;
}

/** A text label, `position` being its top left corner. */
export interface TextDrawing extends DrawingBase {
	type: "text";
	position: Point;
	text: string;
	/** Resized from its size's font by this factor, `1` when left out. */
	scale?: number;
}

/** Anything drawn with the drawing tools. */
export type PlanDrawing = StrokeDrawing | SpanDrawing | TextDrawing;

/** `0` neutral, `1` team A, `2` team B. */
export type InkCell = 0 | 1 | 2;

/** Where the rainmaker is: `null` on its pedestal, dropped somewhere, or carried by a player. */
export type RainmakerState =
	| null
	| { position: Point }
	| { carrier: SlotIndex };

/**
 * The mode played and the state of its objective, ids referring to the map data of the stage and mode.
 * Changing the mode replaces it whole, which is what resets the objective.
 */
export type PlanObjective =
	| { mode: "TW" }
	| {
			mode: "SZ";
			/** Owners by zone id, neutral zones left out. */
			zones: Record<string, TeamIndex>;
	  }
	| {
			mode: "TC";
			clearedCheckpoints: string[];
			/** Tower's place along the rail as a fraction from team A's end, `null` at its start. */
			tower: number | null;
	  }
	| {
			mode: "RM";
			clearedCheckpoints: string[];
			rainmaker: RainmakerState;
	  }
	| {
			mode: "CB";
			/** The team whose basket is open, at most one at a time. */
			openBasket: TeamIndex | null;
	  };

/** Variants of a stage with a layout of their own, the standard layout having none. */
export const MAP_VARIANTS = ["lowTide"] as const;

/** See {@link MAP_VARIANTS}. */
export type MapVariant = (typeof MAP_VARIANTS)[number];

/** A whole plan, see the top of this file. */
export interface PlanDocument {
	stageId: StageId;
	/** Left out for the stage's standard layout, e.g. Mahi-Mahi Resort at high tide. */
	variant?: MapVariant;
	teams: [PlanTeam, PlanTeam];
	/** Always eight entries, `null` for an empty slot. */
	slots: Array<PlanPlayer | null>;
	/** Drawn in this order, last on top. */
	markers: PlanMarker[];
	/** Drawn in this order, last on top. */
	drawings: PlanDrawing[];
	/** {@link INK_GRID} cells row by row from the top left. */
	ink: InkCell[];
	objective: PlanObjective;
}

/** An empty plan of the given map: no players, drawings or ink. */
export function empty({
	stageId,
	mode,
}: {
	stageId: StageId;
	mode: ModeShort;
}): PlanDocument {
	return {
		stageId,
		teams: [
			{ color: DEFAULT_TEAM_COLORS[0] },
			{ color: DEFAULT_TEAM_COLORS[1] },
		],
		slots: Array.from({ length: SLOTS_PER_TEAM * 2 }, () => null),
		markers: [],
		drawings: [],
		ink: emptyInk(),
		objective: emptyObjective(mode),
	};
}

/** Objective state of a mode at the start of a game: zones neutral, nothing cleared, objects where they spawn. */
export function emptyObjective(mode: ModeShort): PlanObjective {
	switch (mode) {
		case "TW":
			return { mode };
		case "SZ":
			return { mode, zones: {} };
		case "TC":
			return { mode, clearedCheckpoints: [], tower: null };
		case "RM":
			return { mode, clearedCheckpoints: [], rainmaker: null };
		case "CB":
			return { mode, openBasket: null };
	}
}

/** A player as added to a slot: normal status, every toggle off, not placed. */
export function newPlayer(weaponId: MainWeaponId): PlanPlayer {
	return {
		weaponId,
		label: "",
		status: "normal",
		specialActive: false,
		radiusShown: false,
		hidden: false,
		position: null,
	};
}

/** A new id for a marker or a drawing. */
export function newId() {
	return nanoid(8);
}

/** The team a slot belongs to. */
export function teamOfSlot(slot: SlotIndex): TeamIndex {
	return slot < SLOTS_PER_TEAM ? 0 : 1;
}

function emptyInk(): InkCell[] {
	return Array.from({ length: INK_GRID.columns * INK_GRID.rows }, () => 0);
}
