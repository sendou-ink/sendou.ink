import type {
	CollisionDetection,
	DragEndEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	DragOverlay,
	getClientRect,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { MainSlotIcon } from "~/components/icons/MainSlot";
import { SideSlotIcon } from "~/components/icons/SideSlot";
import type { Tables } from "~/db/tables";
import {
	findWidgetById,
	type maxWidgetsPerSlot,
	widgetNameKey,
} from "~/features/user-page/core/widgets/portfolio";
import type { WidgetId } from "~/features/user-page/core/widgets/types";
import { USER } from "~/features/user-page/user-page-constants";
import { SUPPORT_PAGE } from "~/utils/urls";
import styles from "./SelectedWidgetsEditor.module.css";
import { WidgetNavIcon } from "./WidgetNavIcon";
import { WidgetSettingsForm } from "./WidgetSettingsForm";

interface SelectedWidgetsEditorProps {
	mainWidgets: Array<Tables["UserWidget"]["widget"]>;
	sideWidgets: Array<Tables["UserWidget"]["widget"]>;
	maxWidgets: ReturnType<typeof maxWidgetsPerSlot>;
	/** Called when a widget is dropped onto another one of its slot, taking its place. */
	onMoveWidget: (widgetId: string, targetWidgetId: string) => void;
	onDragStart: () => void;
	onRemoveWidget: (widgetId: string) => void;
	onSettingsChange: (widgetId: string, settings: any) => void;
	expandedWidgetId: string | null;
	onToggleExpanded: (widgetId: string) => void;
	saveAttempted: boolean;
}

/** The user's chosen main and side widgets, reordered by dragging within their slot. */
export function SelectedWidgetsEditor({
	mainWidgets,
	sideWidgets,
	maxWidgets,
	onMoveWidget,
	onDragStart,
	onRemoveWidget,
	onSettingsChange,
	expandedWidgetId,
	onToggleExpanded,
	saveAttempted,
}: SelectedWidgetsEditorProps) {
	const { t } = useTranslation(["user"]);
	const rootRef = useRef<HTMLDivElement>(null);
	const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 200,
				tolerance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// stable because dnd-kit's auto scroll effect depends on canScroll
	const autoScroll = useMemo(
		() => ({
			canScroll: (element: Element) =>
				element !== document.scrollingElement ||
				!isInsideSticky(rootRef.current),
		}),
		[],
	);

	const handleDragStart = (event: DragStartEvent) => {
		onDragStart();
		setDraggedWidgetId(event.active.id as WidgetId);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setDraggedWidgetId(null);

		if (!over || active.id === over.id) {
			return;
		}

		onMoveWidget(String(active.id), String(over.id));
	};

	return (
		<DndContext
			sensors={sensors}
			autoScroll={autoScroll}
			collisionDetection={closestWidgetOfSameSlot}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={() => setDraggedWidgetId(null)}
		>
			<div ref={rootRef} className={styles.selectedWidgetsList}>
				<div className={styles.slotSection}>
					<div className={styles.slotHeader}>
						<span className="stack horizontal xs">
							<MainSlotIcon size={24} /> {t("user:widgets.mainSlot")}
						</span>
						<SlotCount
							count={mainWidgets.length}
							max={maxWidgets.main}
							supporterMax={USER.MAX_MAIN_WIDGETS_SUPPORTER}
						/>
					</div>
					<SortableContext items={mainWidgets.map((w) => w.id)}>
						<div className={styles.widgetList}>
							{mainWidgets.length === 0 ? (
								<div className={styles.empty}>
									{t("user:widgets.add")} {t("user:widgets.mainSlot")}
								</div>
							) : (
								mainWidgets.map((widget) => (
									<DraggableWidgetItem
										key={widget.id}
										widget={widget}
										onRemove={onRemoveWidget}
										onSettingsChange={onSettingsChange}
										isExpanded={expandedWidgetId === widget.id}
										onToggleExpanded={onToggleExpanded}
										saveAttempted={saveAttempted}
									/>
								))
							)}
						</div>
					</SortableContext>
				</div>

				<div className={`${styles.slotSection} ${styles.sideSlotSection}`}>
					<div className={styles.slotHeader}>
						<span className="stack horizontal xs">
							<SideSlotIcon size={24} /> {t("user:widgets.sideSlot")}
						</span>
						<SlotCount
							count={sideWidgets.length}
							max={maxWidgets.side}
							supporterMax={USER.MAX_SIDE_WIDGETS_SUPPORTER}
						/>
					</div>
					<SortableContext items={sideWidgets.map((w) => w.id)}>
						<div className={styles.widgetList}>
							{sideWidgets.length === 0 ? (
								<div className={styles.empty}>
									{t("user:widgets.add")} {t("user:widgets.sideSlot")}
								</div>
							) : (
								sideWidgets.map((widget) => (
									<DraggableWidgetItem
										key={widget.id}
										widget={widget}
										onRemove={onRemoveWidget}
										onSettingsChange={onSettingsChange}
										isExpanded={expandedWidgetId === widget.id}
										onToggleExpanded={onToggleExpanded}
										saveAttempted={saveAttempted}
									/>
								))
							)}
						</div>
					</SortableContext>
				</div>
			</div>
			{createPortal(
				<DragOverlay>
					{draggedWidgetId ? (
						<DraggedWidgetPreview widgetId={draggedWidgetId} />
					) : null}
				</DragOverlay>,
				document.body,
			)}
		</DndContext>
	);
}

function SlotCount({
	count,
	max,
	supporterMax,
}: {
	count: number;
	max: number;
	supporterMax: number;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<span className={styles.slotCount}>
			{count}/{max}
			{max === supporterMax ? null : (
				<Link to={SUPPORT_PAGE} className={styles.supporterMax}>
					{t("user:widgets.supporterMax", { max: supporterMax })}
				</Link>
			)}
		</span>
	);
}

interface DraggableWidgetItemProps {
	widget: Tables["UserWidget"]["widget"];
	onRemove: (widgetId: string) => void;
	onSettingsChange: (widgetId: string, settings: any) => void;
	isExpanded: boolean;
	onToggleExpanded: (widgetId: string) => void;
	saveAttempted: boolean;
}

function DraggableWidgetItem({
	widget,
	onRemove,
	onSettingsChange,
	isExpanded,
	onToggleExpanded,
	saveAttempted,
}: DraggableWidgetItemProps) {
	const { t } = useTranslation(["user", "common"]);

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: widget.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const widgetDef = findWidgetById(widget.id);
	const hasSettings = widgetDef && "schema" in widgetDef;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`${styles.draggableWidget} ${isDragging ? styles.isDragging : ""}`}
			{...attributes}
		>
			<div className={styles.widgetHeader}>
				<span
					className={styles.widgetName}
					data-testid={`drag-widget-${widget.id}`}
					{...listeners}
				>
					<span className={styles.dragHandle}>☰</span>
					<WidgetNavIcon navItem={widgetDef?.navItem} />
					{t(widgetNameKey(widget.id))}
				</span>
				<div className={styles.widgetActions}>
					{hasSettings ? (
						<SendouButton
							size="miniscule"
							variant="outlined"
							onClick={() => onToggleExpanded(widget.id)}
							testId={`widget-settings-${widget.id}`}
						>
							{isExpanded
								? t("common:actions.hide")
								: t("common:actions.settings")}
						</SendouButton>
					) : null}
					<SendouButton
						size="miniscule"
						variant="minimal-destructive"
						shape="circle"
						icon={<Trash />}
						aria-label={`${t("common:actions.remove")} ${t(widgetNameKey(widget.id))}`}
						onClick={() => onRemove(widget.id)}
						testId={`remove-widget-${widget.id}`}
					/>
				</div>
			</div>

			{isExpanded && hasSettings ? (
				<div data-widget-settings={widget.id} className={styles.widgetSettings}>
					<WidgetSettingsForm
						widget={widget}
						onSettingsChange={onSettingsChange}
						saveAttempted={saveAttempted}
					/>
				</div>
			) : null}
		</div>
	);
}

function DraggedWidgetPreview({ widgetId }: { widgetId: WidgetId }) {
	const { t } = useTranslation(["user", "common"]);

	const widgetDef = findWidgetById(widgetId);

	return (
		<div
			className={`${styles.draggableWidget} ${styles.dragPreview}`}
			data-testid="dragged-widget-preview"
			aria-hidden
		>
			<div className={styles.widgetHeader}>
				<span className={styles.widgetName}>
					<span className={styles.dragHandle}>☰</span>
					<WidgetNavIcon navItem={widgetDef?.navItem} />
					{t(widgetNameKey(widgetId))}
				</span>
				<div className={styles.widgetActions}>
					{widgetDef && "schema" in widgetDef ? (
						<SendouButton size="miniscule" variant="outlined" tabIndex={-1}>
							{t("common:actions.settings")}
						</SendouButton>
					) : null}
					<SendouButton
						size="miniscule"
						variant="minimal-destructive"
						shape="circle"
						icon={<Trash />}
						tabIndex={-1}
					/>
				</div>
			</div>
		</div>
	);
}

/**
 * Keeps a widget dragged past either end of its list previewing at that end, never in the other slot's list.
 * Measures the widgets afresh: dnd-kit's cached rects follow page scroll, which the sticky list doesn't.
 */
const closestWidgetOfSameSlot: CollisionDetection = (args) => {
	const activeSlot = findWidgetById(String(args.active.id))?.slot;
	const droppableContainers = args.droppableContainers.filter(
		(container) => findWidgetById(String(container.id))?.slot === activeSlot,
	);
	const droppableRects = new Map(
		droppableContainers.flatMap((container) =>
			container.node.current
				? [
						[
							container.id,
							getClientRect(container.node.current, { ignoreTransform: true }),
						] as const,
					]
				: [],
		),
	);

	return closestCenter({ ...args, droppableContainers, droppableRects });
};

/** dnd-kit assumes page scroll moves the list, which it doesn't inside a sticky element */
function isInsideSticky(element: HTMLElement | null) {
	for (let current = element; current; current = current.parentElement) {
		if (getComputedStyle(current).position === "sticky") return true;
	}

	return false;
}
