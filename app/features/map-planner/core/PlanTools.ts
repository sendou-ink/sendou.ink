// The drawing tool in hand and the style new drawings get. View state of one
// user like the selection, not part of the plan: shared by the canvas and the
// chrome, framework-free.

import type { DrawingSize } from "./PlanDocument";

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
