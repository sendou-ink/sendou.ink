// The drawing tool in hand and the style new drawings get. View state of one
// user like the selection, not part of the plan: shared by the canvas and the
// chrome, framework-free.

import * as PlanCommands from "./PlanCommands";
import type { DrawingSize, PlanDocument } from "./PlanDocument";
import type { PlanEditor } from "./PlanEditor";
import * as PlanSelection from "./PlanSelection";

/** The tools of the drawing sidebar, in its order. */
export const TOOLS = [
	"select",
	"pen",
	"eraser",
	"arrow",
	"line",
	"text",
	"rectangle",
	"ellipse",
] as const;

/** The fixed palette of drawings, none of them close to the default team colours. */
export const DRAWING_COLORS = [
	"#ffffff",
	"#1a1a1a",
	"#ff4d4d",
	"#ff9f1a",
	"#3ddc84",
	"#ff5cd6",
] as const;

/** See {@link TOOLS}. */
export type Tool = (typeof TOOLS)[number];

/** The tool in hand and the style of what it draws. */
interface ToolState {
	tool: Tool;
	color: string;
	size: DrawingSize;
}

/** See {@link create}. */
export interface PlanTools {
	get: () => ToolState;
	set: (patch: Partial<ToolState>) => void;
	/** Calls `listener` after every change, returns the unsubscribe function. */
	subscribe: (listener: () => void) => () => void;
}

/** The select tool in hand, new drawings white and medium sized. */
export function create(): PlanTools {
	let state: ToolState = {
		tool: "select",
		color: DRAWING_COLORS[0],
		size: "M",
	};
	const listeners = new Set<() => void>();

	return {
		get: () => state,
		set: (patch) => {
			const next = { ...state, ...patch };
			if (
				next.tool === state.tool &&
				next.color === state.color &&
				next.size === state.size
			) {
				return;
			}

			state = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/**
 * The colour and size the palette shows: those of the selected drawings, `null` where they
 * differ, or the tools' when no drawing is selected.
 */
export function shownStyle({
	document,
	selection,
	toolState,
}: {
	document: PlanDocument;
	selection: PlanSelection.Selection;
	toolState: ToolState;
}): { color: string | null; size: DrawingSize | null } {
	const ids = PlanSelection.selectedDrawingIds(selection);
	const selected = document.drawings.filter((drawing) =>
		ids.includes(drawing.id),
	);
	if (selected.length === 0) {
		return { color: toolState.color, size: toolState.size };
	}

	const colors = new Set(selected.map((drawing) => drawing.color));
	const sizes = new Set(selected.map((drawing) => drawing.size));
	return {
		color: colors.size === 1 ? selected[0].color : null,
		size: sizes.size === 1 ? selected[0].size : null,
	};
}

/** Makes the colour or size the tools' and restyles the selected drawings with it. */
export function applyStyle(
	{
		tools,
		editor,
		selection,
	}: {
		tools: PlanTools;
		editor: PlanEditor;
		selection: PlanSelection.PlanSelection;
	},
	style: { color?: string; size?: DrawingSize },
) {
	tools.set(style);
	editor.apply(
		PlanCommands.styleDrawings(
			editor.getDocument(),
			PlanSelection.selectedDrawingIds(selection.get()),
			style,
		),
	);
}
