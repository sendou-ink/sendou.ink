import * as React from "react";
import * as PlanCanvas from "../canvas/PlanCanvas";
import * as PlanCommands from "../core/PlanCommands";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEditor from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as PlanTools from "../core/PlanTools";
import { ActionBar } from "./ActionBar";
import styles from "./MapPlanner.module.css";
import { PlanContextMenu } from "./PlanContextMenu";
import { SlotBar } from "./SlotBar";
import { ToolSidebar } from "./ToolSidebar";

const INITIAL_MAP = { stageId: 0, mode: "SZ" } as const;

export function MapPlanner() {
	const [editor] = React.useState(() =>
		PlanEditor.create(PlanDocument.empty(INITIAL_MAP)),
	);
	const [selection] = React.useState(() => PlanSelection.create());
	const [tools] = React.useState(() => PlanTools.create());
	const document = React.useSyncExternalStore(
		editor.subscribe,
		editor.getDocument,
	);
	// XXX: start shown when autosave restores a plan or a link opens one
	const [isMapShown, setIsMapShown] = React.useState(false);
	const [pickerSlot, setPickerSlot] =
		React.useState<PlanDocument.SlotIndex | null>(null);
	const [contextMenu, setContextMenu] = React.useState<{
		target: PlanCanvas.ContextMenuTarget;
		clientPoint: PlanDocument.Point;
	} | null>(null);
	const canvasRef = React.useRef<PlanCanvas.PlanCanvas | null>(null);
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!containerRef.current) return;

		const canvas = PlanCanvas.create({
			container: containerRef.current,
			editor,
			selection,
			tools,
			isMapShown: false,
			onContextMenu: (target, clientPoint) =>
				setContextMenu({ target, clientPoint }),
		});
		canvasRef.current = canvas;

		return () => {
			canvas.destroy();
			canvasRef.current = null;
		};
	}, [editor, selection, tools]);

	React.useEffect(() => {
		canvasRef.current?.setMapShown(isMapShown);
	}, [isMapShown]);

	return (
		<div className={styles.planner}>
			<SlotBar
				editor={editor}
				document={document}
				selection={selection}
				pickerSlot={pickerSlot}
				onPickerSlotChange={setPickerSlot}
				onPlayerContextMenu={(slot, clientPoint) =>
					setContextMenu({ target: { type: "player", slot }, clientPoint })
				}
				onPlayerClick={(slot) => {
					editor.apply(PlanCommands.placePlayer(editor.getDocument(), slot));
					selection.set({ type: "player", slot });
					const position = editor.getDocument().slots[slot]?.position;
					if (position) canvasRef.current?.centerOn(position);
				}}
				onWeaponDragOut={(slot, weaponId, clientPoint) =>
					canvasRef.current?.dragNewPlayer({ slot, weaponId, clientPoint })
				}
				className={styles.slotBar}
			/>
			<ToolSidebar
				editor={editor}
				selection={selection}
				tools={tools}
				className={styles.toolSidebar}
			/>
			<div
				ref={containerRef}
				className={styles.canvas}
				data-testid="plan-canvas"
			/>
			<ActionBar
				editor={editor}
				document={document}
				isMapShown={isMapShown}
				onMapPicked={() => setIsMapShown(true)}
				onFitView={() => canvasRef.current?.fitView()}
				className={styles.actionBar}
			/>
			{contextMenu ? (
				<PlanContextMenu
					editor={editor}
					document={document}
					target={contextMenu.target}
					clientPoint={contextMenu.clientPoint}
					onClose={() => setContextMenu(null)}
					onSwitchWeapon={setPickerSlot}
				/>
			) : null}
		</div>
	);
}
