// Every keyboard shortcut of the planner in one table: which keys, what they
// do and where they apply. The key handler matches presses against it and the
// cheat sheet lists it, so the two can't drift apart. Framework-free: a press
// is anything shaped like a `KeyboardEvent`.

import * as R from "remeda";
import * as PlanCommands from "./PlanCommands";
import {
	DRAWING_SIZES,
	type DrawingSize,
	type PlayerStatus,
	SLOTS_PER_TEAM,
	type SlotIndex,
} from "./PlanDocument";
import type { PlanEditor } from "./PlanEditor";
import * as PlanSelection from "./PlanSelection";
import * as PlanTools from "./PlanTools";

/** What a hotkey does. */
export type HotkeyCommand =
	| { type: "undo" }
	| { type: "redo" }
	| { type: "selectAll" }
	| { type: "escape" }
	| { type: "cheatSheet" }
	| { type: "pan" }
	| { type: "tool"; tool: PlanTools.Tool }
	| { type: "nextColor" }
	| { type: "smaller" }
	| { type: "bigger" }
	| { type: "deleteDrawings" }
	| { type: "editText" }
	| { type: "bringToFront" }
	| { type: "sendToBack" }
	| { type: "slot"; slot: SlotIndex }
	| { type: "status"; status: PlayerStatus }
	| { type: "toggleSpecial" }
	| { type: "toggleRadius" }
	| { type: "throwSub" }
	| { type: "toggleHidden" }
	| { type: "switchKit" }
	| { type: "switchWeapon" }
	| { type: "editLabel" }
	| { type: "removePlayer" }
	| { type: "stagePicker" }
	| { type: "fitView" }
	| { type: "fullScreen" }
	| { type: "copyLink" }
	| { type: "downloadImage" }
	| { type: "downloadFile" }
	| { type: "openFile" };

/**
 * Where a hotkey applies: anywhere, or only while a player or drawings are selected. Keys only
 * repeat across scopes that can't hold at once.
 */
type HotkeyScope = "always" | "player" | "drawings";

/** The cheat sheet's sections. */
export const HOTKEY_GROUPS = [
	"general",
	"tools",
	"players",
	"drawings",
	"view",
] as const;

/** See {@link HOTKEY_GROUPS}. */
export type HotkeyGroup = (typeof HOTKEY_GROUPS)[number];

/** One shortcut: a command with the keys that run it. */
export interface Hotkey {
	command: HotkeyCommand;
	/**
	 * Key combinations, any of which runs it: a key optionally after `Mod+` (Ctrl, or ⌘ on a
	 * Mac) and `Shift+`. Letters lowercase, digits by position (whatever the layout), other
	 * characters as typed (`?`, `[`) with Shift implied, named keys as `KeyboardEvent.key` names.
	 */
	keys: string[];
	scope: HotkeyScope;
	group: HotkeyGroup;
	/** Runs again while the key is held. */
	repeats?: boolean;
	/** Held down rather than pressed, handled by the canvas itself (see {@link isPanKey}). */
	held?: boolean;
}

const TOOL_KEYS: Record<PlanTools.Tool, string> = {
	select: "v",
	pen: "p",
	eraser: "e",
	arrow: "a",
	line: "l",
	text: "t",
	rectangle: "q",
	ellipse: "o",
};

const STATUS_KEYS: Record<PlayerStatus, string> = {
	normal: "n",
	sharking: "k",
	jumping: "j",
	dead: "d",
};

/** The planner's shortcuts, in the cheat sheet's order. */
export const HOTKEYS: Hotkey[] = [
	{
		command: { type: "undo" },
		keys: ["Mod+z"],
		scope: "always",
		group: "general",
		repeats: true,
	},
	{
		command: { type: "redo" },
		keys: ["Mod+Shift+z", "Mod+y"],
		scope: "always",
		group: "general",
		repeats: true,
	},
	{
		command: { type: "selectAll" },
		keys: ["Mod+a"],
		scope: "always",
		group: "general",
	},
	{
		command: { type: "escape" },
		keys: ["Escape"],
		scope: "always",
		group: "general",
	},
	{
		command: { type: "cheatSheet" },
		keys: ["?"],
		scope: "always",
		group: "general",
	},
	...PlanTools.TOOLS.map(
		(tool): Hotkey => ({
			command: { type: "tool", tool },
			keys: [TOOL_KEYS[tool]],
			scope: "always",
			group: "tools",
		}),
	),
	{
		command: { type: "nextColor" },
		keys: ["c"],
		scope: "always",
		group: "drawings",
	},
	{
		command: { type: "smaller" },
		keys: ["-"],
		scope: "always",
		group: "drawings",
	},
	{
		command: { type: "bigger" },
		keys: ["=", "+"],
		scope: "always",
		group: "drawings",
	},
	{
		command: { type: "deleteDrawings" },
		keys: ["Delete", "Backspace"],
		scope: "drawings",
		group: "drawings",
	},
	{
		command: { type: "editText" },
		keys: ["Enter"],
		scope: "drawings",
		group: "drawings",
	},
	{
		command: { type: "bringToFront" },
		keys: ["]"],
		scope: "drawings",
		group: "drawings",
	},
	{
		command: { type: "sendToBack" },
		keys: ["["],
		scope: "drawings",
		group: "drawings",
	},
	...R.range(0, SLOTS_PER_TEAM * 2).map(
		(slot): Hotkey => ({
			command: { type: "slot", slot: slot as SlotIndex },
			keys: [String(slot + 1)],
			scope: "always",
			group: "players",
		}),
	),
	...(["dead", "sharking", "jumping", "normal"] as const).map(
		(status): Hotkey => ({
			command: { type: "status", status },
			keys: [STATUS_KEYS[status]],
			scope: "player",
			group: "players",
		}),
	),
	{
		command: { type: "toggleSpecial" },
		keys: ["s"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "toggleRadius" },
		keys: ["r"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "throwSub" },
		keys: ["b"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "toggleHidden" },
		keys: ["h"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "switchWeapon" },
		keys: ["w"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "switchKit" },
		keys: ["Shift+w"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "editLabel" },
		keys: ["Enter"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "removePlayer" },
		keys: ["Delete", "Backspace"],
		scope: "player",
		group: "players",
	},
	{
		command: { type: "stagePicker" },
		keys: ["m"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "fitView" },
		keys: ["Shift+1"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "pan" },
		keys: ["Space"],
		scope: "always",
		group: "view",
		held: true,
	},
	{
		command: { type: "fullScreen" },
		keys: ["f"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "copyLink" },
		keys: ["Shift+c"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "downloadImage" },
		keys: ["Mod+Shift+e"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "downloadFile" },
		keys: ["Mod+s"],
		scope: "always",
		group: "view",
	},
	{
		command: { type: "openFile" },
		keys: ["Mod+o"],
		scope: "always",
		group: "view",
	},
];

/** A key press, e.g. a `KeyboardEvent`. */
export interface KeyPress {
	key: string;
	code: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	repeat?: boolean;
}

interface KeyCombo {
	key: string;
	mod: boolean;
	shift: boolean;
}

/** Keys typed as a character of their own, which Shift is part of (`?` is Shift+/ on most layouts). */
const SHIFTED_CHARACTER = /^[^a-z0-9]$/;

const KEY_NAMES: Record<string, string> = {
	Escape: "Esc",
	Delete: "Del",
	Backspace: "⌫",
	Enter: "Enter",
	Space: "Space",
};

/**
 * The command a key press runs with the selection as it is, `null` for none. A held key's
 * repeats only run commands that repeat; held hotkeys (panning) never match.
 */
export function match(
	press: KeyPress,
	selection: PlanSelection.Selection,
): HotkeyCommand | null {
	const hotkey = HOTKEYS.find(
		(candidate) =>
			!candidate.held &&
			appliesTo(candidate.scope, selection) &&
			(!press.repeat || candidate.repeats) &&
			candidate.keys.some((keys) => isPressOf(parseCombo(keys), press)),
	);

	return hotkey?.command ?? null;
}

/** Whether the press (or release) is of the key held to pan the map, whatever modifiers are held with it. */
export function isPanKey(press: KeyPress) {
	return HOTKEYS.some(
		(hotkey) =>
			hotkey.command.type === "pan" &&
			hotkey.keys.some((keys) => parseCombo(keys).key === pressedKey(press)),
	);
}

/** The keycaps of a key combination of {@link Hotkey.keys}, as shown on a Mac or elsewhere. */
export function keycaps(keys: string, { isMac }: { isMac: boolean }) {
	const combo = parseCombo(keys);

	return [
		...(combo.mod ? [isMac ? "⌘" : "Ctrl"] : []),
		...(combo.shift ? [isMac ? "⇧" : "Shift"] : []),
		KEY_NAMES[combo.key] ?? combo.key.toUpperCase(),
	];
}

/**
 * The first keys of the command's hotkey written out, e.g. for a button's tooltip: `P`,
 * `Ctrl+Z` or `⌘Z` on a Mac. Empty when the command has no hotkey.
 */
export function hint(command: HotkeyCommand, { isMac }: { isMac: boolean }) {
	const hotkey = HOTKEYS.find((candidate) =>
		R.isDeepEqual(candidate.command, command),
	);
	if (!hotkey) return "";

	return keycaps(hotkey.keys[0], { isMac }).join(isMac ? "" : "+");
}

/**
 * Runs a command that only acts on the plan, the selection and the tools, returning whether it
 * was one. The rest (camera, pickers, files…) are the host's to run.
 */
export function runOnPlan(
	command: HotkeyCommand,
	{
		editor,
		selection,
		tools,
	}: {
		editor: PlanEditor;
		selection: PlanSelection.PlanSelection;
		tools: PlanTools.PlanTools;
	},
): boolean {
	const document = editor.getDocument();
	const drawingIds = PlanSelection.selectedDrawingIds(selection.get());
	const slot = PlanSelection.selectedSlot(selection.get());
	const player = slot === null ? null : document.slots[slot];
	const shownStyle = () =>
		PlanTools.shownStyle({
			document,
			selection: selection.get(),
			toolState: tools.get(),
		});

	switch (command.type) {
		case "undo":
			editor.undo();
			return true;
		case "redo":
			editor.redo();
			return true;
		case "selectAll":
			tools.set({ tool: "select" });
			selection.set({
				type: "drawings",
				ids: document.drawings.map((drawing) => drawing.id),
			});
			return true;
		case "tool":
			tools.set({ tool: command.tool });
			return true;
		case "nextColor": {
			const colors: readonly string[] = PlanTools.DRAWING_COLORS;
			const current = shownStyle().color ?? tools.get().color;
			const next = colors[(colors.indexOf(current) + 1) % colors.length];
			PlanTools.applyStyle({ tools, editor, selection }, { color: next });
			return true;
		}
		case "smaller":
		case "bigger": {
			const current = shownStyle().size ?? tools.get().size;
			const index = R.clamp(
				DRAWING_SIZES.indexOf(current) + (command.type === "bigger" ? 1 : -1),
				{ min: 0, max: DRAWING_SIZES.length - 1 },
			);
			PlanTools.applyStyle(
				{ tools, editor, selection },
				{ size: DRAWING_SIZES[index] as DrawingSize },
			);
			return true;
		}
		case "deleteDrawings":
			editor.apply(PlanCommands.removeDrawings(document, drawingIds));
			return true;
		case "bringToFront":
		case "sendToBack":
			editor.apply(
				PlanCommands.reorderDrawings(
					document,
					drawingIds,
					command.type === "bringToFront" ? "front" : "back",
				),
			);
			return true;
	}

	if (slot === null || !player) return false;

	switch (command.type) {
		case "status":
			editor.apply(
				PlanCommands.setStatus(
					document,
					slot,
					player.status === command.status ? "normal" : command.status,
				),
			);
			return true;
		case "toggleSpecial":
			editor.apply(PlanCommands.toggleSpecial(document, slot));
			return true;
		case "toggleRadius":
			editor.apply({
				type: "updatePlayer",
				slot,
				patch: { radiusShown: !player.radiusShown },
			});
			return true;
		case "throwSub":
			editor.apply(PlanCommands.throwSub(document, slot));
			return true;
		case "toggleHidden":
			editor.apply(PlanCommands.toggleHidden(document, slot));
			return true;
		case "switchKit":
			editor.apply(PlanCommands.switchKit(document, slot));
			return true;
		case "removePlayer":
			editor.apply(PlanCommands.emptySlot(document, slot));
			selection.set(null);
			return true;
		default:
			return false;
	}
}

function appliesTo(scope: HotkeyScope, selection: PlanSelection.Selection) {
	switch (scope) {
		case "always":
			return true;
		case "player":
			return selection?.type === "player";
		case "drawings":
			return selection?.type === "drawings";
	}
}

function parseCombo(keys: string): KeyCombo {
	const parts = keys.split("+");
	const key = keys === "+" ? "+" : parts.at(-1)!;

	return {
		key,
		mod: parts.includes("Mod"),
		shift: parts.includes("Shift"),
	};
}

function isPressOf(combo: KeyCombo, press: KeyPress) {
	if (SHIFTED_CHARACTER.test(combo.key)) {
		// typed as is: on many layouts with AltGr (Ctrl+Alt on Windows), Option or on a digit key
		return (
			!combo.mod &&
			press.key === combo.key &&
			!press.metaKey &&
			(!press.ctrlKey || press.altKey)
		);
	}
	if (press.altKey) return false;
	if ((press.ctrlKey || press.metaKey) !== combo.mod) return false;
	if (pressedKey(press) !== combo.key) return false;

	return press.shiftKey === combo.shift;
}

/**
 * The key as {@link Hotkey.keys} name it: digits by their position so they work on layouts
 * typing them with Shift, letters as typed (falling back to the position on non-Latin layouts).
 */
function pressedKey({ key, code }: KeyPress) {
	const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
	if (digit) return digit[1];
	if (key === " ") return "Space";
	if (/^[a-z]$/i.test(key)) return key.toLowerCase();

	const letter = /^Key([A-Z])$/.exec(code);
	if (letter && /^\p{L}$/u.test(key)) return letter[1].toLowerCase();

	return key;
}
