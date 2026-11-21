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
import * as Hotkeys from "../canvas/Hotkeys";
import * as PlanCommands from "../core/PlanCommands";
import { DRAWING_SIZES, type DrawingSize } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanHotkeys from "../core/PlanHotkeys";
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
 * show and restyle theirs (none pressed when they differ). On narrow screens the tools, colours
 * and sizes fold away behind a button showing the tool in hand.
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
	const [isExpanded, setIsExpanded] = React.useState(false);
	const [isMac] = React.useState(Hotkeys.isMac);
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
	const shown = PlanTools.shownStyle({
		document,
		selection: currentSelection,
		toolState,
	});

	const applyStyle = (style: { color?: string; size?: DrawingSize }) =>
		PlanTools.applyStyle({ tools, editor, selection }, style);
	const ToolInHandIcon = TOOL_ICONS[toolState.tool];

	return (
		<div className={clsx(styles.sidebar, className)} data-expanded={isExpanded}>
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<ToolInHandIcon />}
				aria-label={t("common:plans.drawingTools")}
				title={t("common:plans.drawingTools")}
				aria-expanded={isExpanded}
				className={styles.expandButton}
				onClick={() => setIsExpanded(!isExpanded)}
				testId="plan-tools-expand-button"
			/>
			<div className={clsx(styles.group, styles.collapsible)}>
				{PlanTools.TOOLS.map((tool) => {
					const Icon = TOOL_ICONS[tool];
					const name = t(`common:plans.tool.${tool}`);
					return (
						<SendouButton
							key={tool}
							variant="minimal"
							shape="square"
							icon={<Icon />}
							aria-label={name}
							title={`${name} (${PlanHotkeys.hint({ type: "tool", tool }, { isMac })})`}
							aria-pressed={toolState.tool === tool}
							className={styles.toggle}
							onClick={() => {
								tools.set({ tool });
								setIsExpanded(false);
							}}
							testId={`plan-tool-${tool}`}
						/>
					);
				})}
			</div>
			<div className={clsx(styles.group, styles.collapsible)}>
				{PlanTools.DRAWING_COLORS.map((color) => (
					<button
						key={color}
						type="button"
						className={styles.swatch}
						style={{ "--swatch-color": color } as React.CSSProperties}
						aria-label={t(`common:plans.color.${COLOR_NAMES[color]}`)}
						title={t(`common:plans.color.${COLOR_NAMES[color]}`)}
						aria-pressed={shown.color === color}
						onMouseDown={keepFocus}
						onClick={() => applyStyle({ color })}
						data-testid={`plan-color-${COLOR_NAMES[color]}`}
					/>
				))}
			</div>
			<div className={clsx(styles.group, styles.sizes, styles.collapsible)}>
				{DRAWING_SIZES.map((size) => (
					<button
						key={size}
						type="button"
						className={styles.size}
						data-size={size}
						aria-label={t(`common:plans.size.${size}`)}
						title={t(`common:plans.size.${size}`)}
						aria-pressed={shown.size === size}
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
					title={`${t("common:plans.undo")} (${PlanHotkeys.hint({ type: "undo" }, { isMac })})`}
					isDisabled={!canUndo}
					onClick={editor.undo}
					testId="plan-undo-button"
				/>
				<SendouButton
					variant="minimal"
					shape="square"
					icon={<Redo2 />}
					aria-label={t("common:plans.redo")}
					title={`${t("common:plans.redo")} (${PlanHotkeys.hint({ type: "redo" }, { isMac })})`}
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
