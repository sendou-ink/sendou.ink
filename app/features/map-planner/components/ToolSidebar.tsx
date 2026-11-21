import clsx from "clsx";
import {
	Circle,
	Eraser,
	type LucideIcon,
	Minus,
	MousePointer2,
	MoveUpRight,
	Pencil,
	Redo2,
	Square,
	Trash2,
	Type,
	Undo2,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import * as PlanCommands from "../core/PlanCommands";
import { DRAWING_SIZES, type DrawingSize } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as PlanTools from "../core/PlanTools";
import styles from "./ToolSidebar.module.css";

const TOOL_ICONS: Record<PlanTools.Tool, LucideIcon> = {
	select: MousePointer2,
	pen: Pencil,
	eraser: Eraser,
	arrow: MoveUpRight,
	line: Minus,
	text: Type,
	rectangle: Square,
	ellipse: Circle,
};

const COLOR_NAMES = {
	"#ffffff": "white",
	"#1a1a1a": "black",
	"#ff4d4d": "red",
	"#ff9f1a": "orange",
	"#3ddc84": "green",
	"#ff5cd6": "pink",
} as const satisfies Record<(typeof PlanTools.DRAWING_COLORS)[number], string>;

/**
 * The drawing tools on the left of the map: the tool in hand, the colour and size of what it
 * draws, deleting the selection, undo and redo. With drawings selected the colour and size
 * show and restyle theirs (none pressed when they differ).
 */
export function ToolSidebar({
	editor,
	selection,
	tools,
	className,
}: {
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	tools: PlanTools.PlanTools;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);
	const canUndo = React.useSyncExternalStore(editor.subscribe, editor.canUndo);
	const canRedo = React.useSyncExternalStore(editor.subscribe, editor.canRedo);
	const document = React.useSyncExternalStore(
		editor.subscribe,
		editor.getDocument,
	);
	const toolState = React.useSyncExternalStore(tools.subscribe, tools.get);
	const currentSelection = React.useSyncExternalStore(
		selection.subscribe,
		selection.get,
	);

	const selectedIds = PlanSelection.selectedDrawingIds(currentSelection);
	const selectedDrawings = document.drawings.filter((drawing) =>
		selectedIds.includes(drawing.id),
	);
	const hasSelectedDrawings = selectedDrawings.length > 0;
	const shownColor = hasSelectedDrawings
		? sharedValue(selectedDrawings, "color")
		: toolState.color;
	const shownSize = hasSelectedDrawings
		? sharedValue(selectedDrawings, "size")
		: toolState.size;

	const applyStyle = (style: { color?: string; size?: DrawingSize }) => {
		tools.set(style);
		editor.apply(
			PlanCommands.styleDrawings(editor.getDocument(), selectedIds, style),
		);
	};

	return (
		<div className={clsx(styles.sidebar, className)}>
			<div className={styles.group}>
				{PlanTools.TOOLS.map((tool) => {
					const Icon = TOOL_ICONS[tool];
					return (
						<SendouButton
							key={tool}
							variant="minimal"
							shape="square"
							icon={<Icon />}
							aria-label={t(`common:plans.tool.${tool}`)}
							title={t(`common:plans.tool.${tool}`)}
							aria-pressed={toolState.tool === tool}
							className={styles.toggle}
							onClick={() => tools.set({ tool })}
							testId={`plan-tool-${tool}`}
						/>
					);
				})}
			</div>
			<div className={styles.group}>
				{PlanTools.DRAWING_COLORS.map((color) => (
					<button
						key={color}
						type="button"
						className={styles.swatch}
						style={{ "--swatch-color": color } as React.CSSProperties}
						aria-label={t(`common:plans.color.${COLOR_NAMES[color]}`)}
						title={t(`common:plans.color.${COLOR_NAMES[color]}`)}
						aria-pressed={shownColor === color}
						onMouseDown={keepFocus}
						onClick={() => applyStyle({ color })}
						data-testid={`plan-color-${COLOR_NAMES[color]}`}
					/>
				))}
			</div>
			<div className={clsx(styles.group, styles.sizes)}>
				{DRAWING_SIZES.map((size) => (
					<button
						key={size}
						type="button"
						className={styles.size}
						data-size={size}
						aria-label={t(`common:plans.size.${size}`)}
						title={t(`common:plans.size.${size}`)}
						aria-pressed={shownSize === size}
						onMouseDown={keepFocus}
						onClick={() => applyStyle({ size })}
						data-testid={`plan-size-${size}`}
					/>
				))}
			</div>
			<div className={styles.group}>
				<SendouButton
					variant="minimal"
					shape="square"
					icon={<Undo2 />}
					aria-label={t("common:plans.undo")}
					title={t("common:plans.undo")}
					isDisabled={!canUndo}
					onClick={editor.undo}
					testId="plan-undo-button"
				/>
				<SendouButton
					variant="minimal"
					shape="square"
					icon={<Redo2 />}
					aria-label={t("common:plans.redo")}
					title={t("common:plans.redo")}
					isDisabled={!canRedo}
					onClick={editor.redo}
					testId="plan-redo-button"
				/>
				<SendouButton
					variant="minimal-destructive"
					shape="square"
					icon={<Trash2 />}
					aria-label={t("common:plans.deleteSelected")}
					title={t("common:plans.deleteSelected")}
					isDisabled={selectedIds.length === 0}
					onClick={() =>
						editor.apply(
							PlanCommands.removeDrawings(editor.getDocument(), selectedIds),
						)
					}
					testId="plan-delete-button"
				/>
			</div>
		</div>
	);
}

/** Keeps the focus where it is, e.g. in a label being typed, which the style then applies to. */
function keepFocus(event: React.MouseEvent) {
	event.preventDefault();
}

/** The value all the drawings have in common, `null` when they differ or there are none. */
function sharedValue<Key extends "color" | "size">(
	drawings: Array<{ color: string; size: DrawingSize }>,
	key: Key,
) {
	const values = new Set(drawings.map((drawing) => drawing[key]));
	return values.size === 1
		? (drawings[0][key] as (typeof drawings)[0][Key])
		: null;
}
