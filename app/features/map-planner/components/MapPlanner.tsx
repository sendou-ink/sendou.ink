import * as React from "react";
import * as PlanCanvas from "../canvas/PlanCanvas";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEditor from "../core/PlanEditor";
import { ActionBar } from "./ActionBar";
import styles from "./MapPlanner.module.css";
import { SlotBar } from "./SlotBar";
import { ToolSidebar } from "./ToolSidebar";

const INITIAL_MAP = { stageId: 0, mode: "SZ" } as const;

export function MapPlanner() {
	const [editor] = React.useState(() =>
		PlanEditor.create(PlanDocument.empty(INITIAL_MAP)),
	);
	const document = React.useSyncExternalStore(
		editor.subscribe,
		editor.getDocument,
	);
	const canvasRef = React.useRef<PlanCanvas.PlanCanvas | null>(null);
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!containerRef.current) return;

		const canvas = PlanCanvas.create({
			container: containerRef.current,
			editor,
		});
		canvasRef.current = canvas;

		return () => {
			canvas.destroy();
			canvasRef.current = null;
		};
	}, [editor]);

	return (
		<div className={styles.planner}>
			<SlotBar document={document} className={styles.slotBar} />
			<ToolSidebar editor={editor} className={styles.toolSidebar} />
			<div
				ref={containerRef}
				className={styles.canvas}
				data-testid="plan-canvas"
			/>
			<ActionBar
				editor={editor}
				document={document}
				onFitView={() => canvasRef.current?.fitView()}
				className={styles.actionBar}
			/>
		</div>
	);
}
