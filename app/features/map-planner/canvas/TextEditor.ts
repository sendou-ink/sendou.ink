// Typing a text label: a text field laid over the map exactly where the label
// is drawn, at the map's zoom, in the label's colour and font. Enter or
// clicking elsewhere saves it, Shift+Enter starts a new line and Escape
// throws the edit away. A label being edited is selected, so picking a
// colour or size restyles it; a new one takes the tools' style as it changes.
// Plain DOM, no React.

import type * as PlanCamera from "../core/PlanCamera";
import * as PlanCommands from "../core/PlanCommands";
import {
	DRAWING_TEXT_MAX_LENGTH,
	newId,
	type Point,
	type TextDrawing,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import type { PlanTools } from "../core/PlanTools";
import * as DrawingLook from "./DrawingLook";

const EDITING_OUTLINE = "1px dashed #38bdf8";
/** Room for the caret after the last character, in screen pixels. */
const CARET_ROOM = 4;

/** See {@link create}. */
export interface TextEditor {
	/** Starts typing a new label with its top left corner at a map point, in the tools' style. */
	openNew: (position: Point) => void;
	/** Starts editing the text of an existing label. */
	openExisting: (id: string) => void;
	isOpen: () => boolean;
	/** Moves and sizes the field after the camera changed. */
	reposition: () => void;
	/** Saves what was typed and closes the field. */
	close: () => void;
	destroy: () => void;
}

/** A text editor laying its field over `container`, which must be positioned. */
export function create({
	container,
	editor,
	selection,
	tools,
	getCamera,
	onEditingChange,
}: {
	container: HTMLElement;
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	tools: PlanTools;
	getCamera: () => PlanCamera.Camera;
	/** The existing label being edited, so it isn't drawn under its field, `null` when done. */
	onEditingChange: (id: string | null) => void;
}): TextEditor {
	let editing: {
		field: HTMLTextAreaElement;
		drawing: Omit<TextDrawing, "text">;
		isNew: boolean;
	} | null = null;

	const reposition = () => {
		if (!editing) return;

		const camera = getCamera();
		const { drawing, field } = editing;
		const style = DrawingLook.textStyle(drawing);
		const scale = (drawing.scale ?? 1) * camera.scale;
		Object.assign(field.style, {
			left: `${camera.x + drawing.position[0] * camera.scale}px`,
			top: `${camera.y + drawing.position[1] * camera.scale}px`,
			fontSize: `${style.fontSize * scale}px`,
			lineHeight: String(style.lineHeight),
			color: style.fill,
			webkitTextStroke: `${style.strokeWidth * scale}px ${style.stroke}`,
		});
		fitToText(field);
	};

	const finish = (save: boolean) => {
		if (!editing) return;

		const { field, drawing, isNew } = editing;
		editing = null;
		field.remove();
		onEditingChange(null);
		const selectedIds = PlanSelection.selectedDrawingIds(selection.get());
		if (
			!isNew &&
			tools.get().tool !== "select" &&
			selectedIds.length === 1 &&
			selectedIds[0] === drawing.id
		) {
			selection.set(null);
		}
		if (!save) return;

		if (isNew) {
			if (field.value.trim() === "") return;
			editor.apply({
				type: "addDrawing",
				drawing: {
					...drawing,
					text: field.value.slice(0, DRAWING_TEXT_MAX_LENGTH),
				},
			});
			return;
		}
		editor.apply(
			PlanCommands.setText(editor.getDocument(), drawing.id, field.value),
		);
	};

	const open = (drawing: TextDrawing, isNew: boolean) => {
		finish(true);

		const field = document.createElement("textarea");
		field.value = drawing.text;
		field.maxLength = DRAWING_TEXT_MAX_LENGTH;
		field.spellcheck = false;
		field.rows = 1;
		field.dataset.testid = "plan-text-field";
		Object.assign(field.style, {
			position: "absolute",
			zIndex: "1",
			minWidth: "0",
			minHeight: "0",
			margin: "0",
			padding: "0",
			border: "none",
			borderRadius: "0",
			outline: EDITING_OUTLINE,
			background: "transparent",
			resize: "none",
			overflow: "hidden",
			whiteSpace: "pre",
			fontFamily: DrawingLook.TEXT_FONT_FAMILY,
			fontWeight: DrawingLook.TEXT_FONT_WEIGHT,
			paintOrder: "stroke fill",
		});
		field.addEventListener("input", () => fitToText(field));
		field.addEventListener("blur", () => finish(true));
		field.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				finish(false);
			} else if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				finish(true);
			}
		});

		const { text: _, ...withoutText } = drawing;
		editing = { field, drawing: withoutText, isNew };
		container.append(field);
		reposition();
		if (!isNew) {
			onEditingChange(drawing.id);
			selection.set({ type: "drawings", ids: [drawing.id] });
		}
		// after the click that opened it, which would otherwise take the focus back
		requestAnimationFrame(() => {
			if (editing?.field !== field) return;
			field.focus();
			field.select();
		});
	};

	const restyle = (style: Pick<TextDrawing, "color" | "size" | "scale">) => {
		if (!editing) return;

		editing.drawing = { ...editing.drawing, ...style };
		reposition();
	};

	const unsubscribeEditor = editor.subscribe(({ document }) => {
		if (!editing || editing.isNew) return;

		const { id } = editing.drawing;
		const current = document.drawings.find((drawing) => drawing.id === id);
		if (current?.type !== "text") {
			finish(false);
			return;
		}
		restyle({ color: current.color, size: current.size, scale: current.scale });
	});

	const unsubscribeTools = tools.subscribe(() => {
		if (!editing?.isNew) return;

		const { color, size } = tools.get();
		restyle({ color, size });
	});

	return {
		openNew: (position) => {
			const { color, size } = tools.get();
			open(
				{ id: newId(), type: "text", color, size, position, text: "" },
				true,
			);
		},
		openExisting: (id) => {
			const existing = editor
				.getDocument()
				.drawings.find((drawing) => drawing.id === id);
			if (existing?.type === "text") open(existing, false);
		},
		isOpen: () => editing !== null,
		reposition,
		close: () => finish(true),
		destroy: () => {
			unsubscribeEditor();
			unsubscribeTools();
			finish(false);
		},
	};
}

/** Grows and shrinks the field to fit its text, a caret's width wider so typing doesn't scroll it. */
function fitToText(field: HTMLTextAreaElement) {
	field.style.width = "0";
	field.style.height = "0";
	field.style.width = `${field.scrollWidth + CARET_ROOM}px`;
	field.style.height = `${field.scrollHeight}px`;
}
