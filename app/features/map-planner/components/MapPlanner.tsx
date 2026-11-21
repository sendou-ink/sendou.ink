import * as React from "react";
import { useTranslation } from "react-i18next";
import { toastQueue } from "~/components/elements/Toast";
import { useLatestRef } from "~/hooks/useLatestRef";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type { SearchParamsValues } from "~/modules/search-params/search-params";
import * as Hotkeys from "../canvas/Hotkeys";
import * as PlanCanvas from "../canvas/PlanCanvas";
import * as PlanAutosave from "../core/PlanAutosave";
import * as PlanCommands from "../core/PlanCommands";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEditor from "../core/PlanEditor";
import * as PlanEncoding from "../core/PlanEncoding";
import * as PlanHotkeys from "../core/PlanHotkeys";
import * as PlanSelection from "../core/PlanSelection";
import * as PlanTools from "../core/PlanTools";
import { useFullScreen } from "../hooks/useFullScreen";
import { autosavedPlanPersisted } from "../plans-persisted";
import { plansSearchParams } from "../plans-search-params";
import { ActionBar, usePlanFileActions } from "./ActionBar";
import { HotkeySheet } from "./HotkeySheet";
import styles from "./MapPlanner.module.css";
import { PlanContextMenu } from "./PlanContextMenu";
import { SlotBar } from "./SlotBar";
import { ToolSidebar } from "./ToolSidebar";

const INITIAL_MAP = { stageId: 0, mode: "SZ" } as const;

const LINK_ERROR_KEYS = {
	invalid: "common:plans.link.invalid",
	tldraw: "common:plans.link.invalid",
	unsupportedVersion: "common:plans.newerVersion",
} as const;

export function MapPlanner() {
	const { t } = useTranslation(["common"]);
	const [linkParams, setLinkParams] = useSearchParamsTyped(plansSearchParams);
	const [opened] = React.useState(() => openPlan(linkParams));
	const editor = opened.editor;
	const [selection] = React.useState(() => PlanSelection.create());
	const [tools] = React.useState(() => PlanTools.create());
	const document = React.useSyncExternalStore(
		editor.subscribe,
		editor.getDocument,
	);
	const [isMapShown, setIsMapShown] = React.useState(opened.isMapShown);
	const [isStagePickerOpen, setIsStagePickerOpen] = React.useState(
		!opened.isMapShown,
	);
	const [isHotkeySheetOpen, setIsHotkeySheetOpen] = React.useState(false);
	const fullScreen = useFullScreen();
	const [pickerSlot, setPickerSlot] =
		React.useState<PlanDocument.SlotIndex | null>(null);
	const [contextMenu, setContextMenu] = React.useState<{
		target: PlanCanvas.ContextMenuTarget;
		clientPoint: PlanDocument.Point;
	} | null>(null);
	const canvasRef = React.useRef<PlanCanvas.PlanCanvas | null>(null);
	const containerRef = React.useRef<HTMLDivElement>(null);
	const labelInputsRef = React.useRef(
		new Map<PlanDocument.SlotIndex, HTMLInputElement>(),
	);
	const fileActions = usePlanFileActions({
		editor,
		exportImage: () => {
			if (!canvasRef.current) {
				return Promise.reject(new Error("No canvas to export"));
			}
			return canvasRef.current.exportImage();
		},
		onPlanOpened: () => {
			selection.set(null);
			setIsMapShown(true);
			setIsStagePickerOpen(false);
		},
	});

	/** What a click on a filled slot does: its token goes on the map, selected and centered on. */
	const selectPlayer = (slot: PlanDocument.SlotIndex) => {
		editor.apply(PlanCommands.placePlayer(editor.getDocument(), slot));
		selection.set({ type: "player", slot });
		const position = editor.getDocument().slots[slot]?.position;
		if (position) canvasRef.current?.centerOn(position);
	};

	const runHotkey = (command: PlanHotkeys.HotkeyCommand) => {
		if (PlanHotkeys.runOnPlan(command, { editor, selection, tools })) return;

		const canvas = canvasRef.current;
		const selected = selection.get();
		const selectedSlot = PlanSelection.selectedSlot(selected);
		switch (command.type) {
			case "escape":
				if (canvas?.cancelGesture()) return;
				if (selected) selection.set(null);
				else tools.set({ tool: "select" });
				return;
			case "cheatSheet":
				setIsHotkeySheetOpen(true);
				return;
			case "slot":
				if (editor.getDocument().slots[command.slot]) {
					selectPlayer(command.slot);
				} else {
					setPickerSlot(command.slot);
				}
				return;
			case "switchWeapon":
				if (selectedSlot !== null) setPickerSlot(selectedSlot);
				return;
			case "editLabel": {
				const input =
					selectedSlot === null
						? null
						: labelInputsRef.current.get(selectedSlot);
				input?.focus();
				input?.select();
				return;
			}
			case "editText": {
				const ids = PlanSelection.selectedDrawingIds(selected);
				const drawing = editor
					.getDocument()
					.drawings.find((candidate) => candidate.id === ids[0]);
				if (ids.length === 1 && drawing?.type === "text") {
					canvas?.editText(drawing.id);
				}
				return;
			}
			case "stagePicker":
				setIsStagePickerOpen(!isStagePickerOpen);
				return;
			case "fitView":
				canvas?.fitView();
				return;
			case "fullScreen":
				if (fullScreen.isSupported) fullScreen.toggle();
				return;
			case "copyLink":
				if (isMapShown) fileActions.copyLink();
				return;
			case "downloadImage":
				if (isMapShown) fileActions.downloadImage();
				return;
			case "downloadFile":
				if (isMapShown) fileActions.downloadFile();
				return;
			case "openFile":
				fileActions.openFile();
				return;
		}
	};
	const runHotkeyRef = useLatestRef(runHotkey);

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

	React.useEffect(
		() =>
			Hotkeys.listen({
				selection,
				onCommand: (command) => runHotkeyRef.current(command),
			}),
		[selection, runHotkeyRef],
	);

	const linkHandledRef = React.useRef(false);
	React.useEffect(() => {
		if (linkHandledRef.current || !opened.isFromLink) return;
		linkHandledRef.current = true;

		setLinkParams({ plan: null, stage: null, mode: null });
		if (opened.linkError) {
			toastQueue.add({
				message: t(LINK_ERROR_KEYS[opened.linkError]),
				variant: "error",
			});
		}
	}, [opened, setLinkParams, t]);

	React.useEffect(() => {
		if (!isMapShown) return;

		return startAutosave(editor);
	}, [editor, isMapShown]);

	return (
		<div className={styles.planner}>
			<div className={styles.layout}>
				<SlotBar
					editor={editor}
					document={document}
					selection={selection}
					pickerSlot={pickerSlot}
					onPickerSlotChange={setPickerSlot}
					onPlayerContextMenu={(slot, clientPoint) => {
						if (tools.get().tool === "select") {
							selection.set({ type: "player", slot });
						}
						setContextMenu({ target: { type: "player", slot }, clientPoint });
					}}
					onPlayerClick={selectPlayer}
					onWeaponDragOut={(slot, weaponId, clientPoint) =>
						canvasRef.current?.dragNewPlayer({ slot, weaponId, clientPoint })
					}
					labelInputs={labelInputsRef}
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
					isStagePickerOpen={isStagePickerOpen}
					onStagePickerOpenChange={setIsStagePickerOpen}
					onFitView={() => canvasRef.current?.fitView()}
					fullScreen={fullScreen}
					onShowHotkeys={() => setIsHotkeySheetOpen(true)}
					fileActions={fileActions}
					className={styles.actionBar}
				/>
				{isHotkeySheetOpen ? (
					<HotkeySheet onClose={() => setIsHotkeySheetOpen(false)} />
				) : null}
			</div>
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

/**
 * The editor of the plan the planner opens with: the autosaved one, replaced by the plan of the
 * link that opened the planner, if any, as an undoable step. The map shows right away unless it
 * is a fresh empty plan whose map is still to be picked.
 */
function openPlan(link: SearchParamsValues<typeof plansSearchParams.shape>) {
	const autosaved = PersistedState.read(autosavedPlanPersisted);
	const restored = autosaved ? PlanEncoding.decode(autosaved) : null;
	const editor = PlanEditor.create(
		restored?.ok ? restored.document : PlanDocument.empty(INITIAL_MAP),
	);

	const linked = planOfLink(link, editor.getDocument());
	if (linked?.ok) {
		editor.apply(
			PlanCommands.replacePlan(editor.getDocument(), linked.document),
		);
	}

	return {
		editor,
		isMapShown:
			Boolean(restored?.ok) ||
			(Boolean(linked?.ok) && (link.plan !== null || link.stage !== null)),
		isFromLink: linked !== null,
		linkError: linked && !linked.ok ? linked.error : null,
	};
}

/** The plan of a link: a whole plan, or an empty one of its stage and mode. */
function planOfLink(
	{ plan, stage, mode }: SearchParamsValues<typeof plansSearchParams.shape>,
	current: PlanDocument.PlanDocument,
): PlanEncoding.DecodeResult | null {
	if (plan !== null) return PlanEncoding.fromUrlParam(plan);
	if (stage === null && mode === null) return null;

	return {
		ok: true,
		document: PlanDocument.empty({
			stageId: stage ?? current.stageId,
			mode: mode ?? current.objective.mode,
		}),
	};
}

/** Saves the plan in the browser after every change, and right away when the page is left. */
function startAutosave(editor: PlanEditor.PlanEditor) {
	const save = (document: PlanDocument.PlanDocument) =>
		PersistedState.write(autosavedPlanPersisted, PlanEncoding.encode(document));
	save(editor.getDocument());

	const autosave = PlanAutosave.start({ editor, save });
	const onVisibilityChange = () => {
		if (window.document.visibilityState === "hidden") autosave.flush();
	};
	window.addEventListener("pagehide", autosave.flush);
	window.document.addEventListener("visibilitychange", onVisibilityChange);

	return () => {
		window.removeEventListener("pagehide", autosave.flush);
		window.document.removeEventListener("visibilitychange", onVisibilityChange);
		autosave.stop();
	};
}
