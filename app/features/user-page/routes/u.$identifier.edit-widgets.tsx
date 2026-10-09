import type { DragEndEvent } from "@dnd-kit/core";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search as SearchIcon, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useLoaderData } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { Image } from "~/components/Image";
import { Input } from "~/components/Input";
import { MainSlotIcon } from "~/components/icons/MainSlot";
import { SideSlotIcon } from "~/components/icons/SideSlot";
import { Placeholder } from "~/components/Placeholder";
import type { Tables } from "~/db/tables";
import {
	ALL_WIDGETS,
	defaultStoredWidget,
	findWidgetById,
	maxWidgetsPerSlot,
} from "~/features/user-page/core/widgets/portfolio";
import type { WidgetId } from "~/features/user-page/core/widgets/types";
import { getWidgetFormSchema } from "~/features/user-page/core/widgets/widget-form-schemas";
import { USER } from "~/features/user-page/user-page-constants";
import { useUnsavedChangesChecker } from "~/form/UnsavedChangesGuard";
import { RENDERS_FIELD_ERRORS_KEY } from "~/form/utils";
import { useHydrated } from "~/hooks/useHydrated";
import { useHasRole } from "~/modules/permissions/hooks";
import { navIconUrl, SUPPORT_PAGE } from "~/utils/urls";
import { action } from "../actions/u.$identifier.edit-widgets.server";
import { SubPageHeader } from "../components/SubPageHeader";
import { WidgetSettingsForm } from "../components/WidgetSettingsForm";
import { loader } from "../loaders/u.$identifier.edit-widgets.server";
import { useUserPageLayoutData } from "../user-page-hooks";
import styles from "./u.$identifier.edit-widgets.module.css";

export { action, loader };

type MaxWidgets = ReturnType<typeof maxWidgetsPerSlot>;

export default function EditWidgetsPage() {
	const { t } = useTranslation(["user", "common"]);
	const data = useLoaderData<typeof loader>();
	const isHydrated = useHydrated();
	const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();

	const layoutData = useUserPageLayoutData();

	const isSupporter = useHasRole("SUPPORTER");
	const maxWidgets = maxWidgetsPerSlot(isSupporter);

	const [selectedWidgets, setSelectedWidgets] = useState<
		Array<Tables["UserWidget"]["widget"]>
	>(data.currentWidgets);
	const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null);
	const [emptySaveAttempted, setEmptySaveAttempted] = useState(false);

	const hasUnsavedChangesRef = useRef<
		Parameters<typeof useUnsavedChangesChecker>[0]["current"]
	>(() => false);
	hasUnsavedChangesRef.current = () =>
		fetcher.state === "idle" &&
		!R.isDeepEqual(selectedWidgets, data.currentWidgets);
	useUnsavedChangesChecker(hasUnsavedChangesRef);

	const mainWidgets = selectedWidgets.filter((w) => {
		const def = findWidgetById(w.id);
		return def?.slot === "main";
	});

	const sideWidgets = selectedWidgets.filter((w) => {
		const def = findWidgetById(w.id);
		return def?.slot === "side";
	});

	const saveRejected =
		fetcher.state === "idle" && Boolean(fetcher.data?.fieldErrors);

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

	const handleDragStart = () => {
		setExpandedWidgetId(null);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) {
			return;
		}

		const oldIndex = selectedWidgets.findIndex((w) => w.id === active.id);
		const newIndex = selectedWidgets.findIndex((w) => w.id === over.id);

		setSelectedWidgets(arrayMove(selectedWidgets, oldIndex, newIndex));
	};

	const addWidget = (widgetId: string) => {
		const widget = findWidgetById(widgetId);
		if (!widget) return;

		const currentCount =
			widget.slot === "main" ? mainWidgets.length : sideWidgets.length;
		const maxCount = widget.slot === "main" ? maxWidgets.main : maxWidgets.side;

		if (currentCount >= maxCount) return;

		const newWidget = defaultStoredWidget(widgetId);

		setSelectedWidgets([...selectedWidgets, newWidget]);

		const widgetDef = findWidgetById(widgetId);
		if (widgetDef && "schema" in widgetDef) {
			setExpandedWidgetId(widgetId);
		}
	};

	const removeWidget = (widgetId: string) => {
		setSelectedWidgets(selectedWidgets.filter((w) => w.id !== widgetId));
		setExpandedWidgetId((prev) => (prev === widgetId ? null : prev));
	};

	const handleSubmit = () => {
		if (selectedWidgets.length === 0) {
			setEmptySaveAttempted(true);
			return;
		}

		const invalidWidgetIds = computeInvalidWidgetIds(selectedWidgets);
		const firstInvalid = selectedWidgets.find((w) =>
			invalidWidgetIds.has(w.id),
		);
		if (firstInvalid) {
			flushSync(() => setExpandedWidgetId(firstInvalid.id));
			scrollToFirstWidgetError(
				document.querySelector<HTMLDivElement>(
					`[data-widget-settings="${firstInvalid.id}"]`,
				),
			);
			return;
		}

		fetcher.submit(
			{
				widgets: selectedWidgets,
				[RENDERS_FIELD_ERRORS_KEY]: true,
			} as unknown as Record<string, string>,
			{ method: "post", encType: "application/json" },
		);
	};

	const handleSettingsChange = (widgetId: string, settings: any) => {
		setSelectedWidgets(
			selectedWidgets.map((w) => (w.id === widgetId ? { ...w, settings } : w)),
		);
	};

	const toggleExpanded = (widgetId: string) => {
		setExpandedWidgetId((prev) => (prev === widgetId ? null : widgetId));
	};

	if (!isHydrated) {
		return (
			<div className={styles.container}>
				<SubPageHeader
					user={layoutData.user}
					title={t("user:widgets.editTitle")}
				/>
				<Placeholder />
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<SubPageHeader user={layoutData.user} title={t("user:widgets.editTitle")}>
				<div className={styles.actions}>
					<SendouButton onClick={handleSubmit}>
						{t("common:actions.save")}
					</SendouButton>
					{emptySaveAttempted && selectedWidgets.length === 0 ? (
						<FormMessage type="error" spaced={false}>
							{t("user:widgets.emptyError")}
						</FormMessage>
					) : saveRejected ? (
						<FormMessage type="error" spaced={false}>
							{t("user:widgets.saveError")}
						</FormMessage>
					) : null}
				</div>
			</SubPageHeader>

			<div className={styles.content}>
				<div className={styles.grid}>
					<section className={styles.selected}>
						<DndContext
							sensors={sensors}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
						>
							<SelectedWidgetsList
								mainWidgets={mainWidgets}
								sideWidgets={sideWidgets}
								maxWidgets={maxWidgets}
								onRemoveWidget={removeWidget}
								onSettingsChange={handleSettingsChange}
								expandedWidgetId={expandedWidgetId}
								onToggleExpanded={toggleExpanded}
							/>
						</DndContext>
					</section>

					<section className={styles.available}>
						<h2>{t("user:widgets.available")}</h2>
						<AvailableWidgetsList
							selectedWidgets={selectedWidgets}
							mainWidgets={mainWidgets}
							sideWidgets={sideWidgets}
							maxWidgets={maxWidgets}
							isSupporter={isSupporter}
							onAddWidget={addWidget}
						/>
					</section>
				</div>
			</div>
		</div>
	);
}

interface AvailableWidgetsListProps {
	selectedWidgets: Array<Tables["UserWidget"]["widget"]>;
	mainWidgets: Array<Tables["UserWidget"]["widget"]>;
	sideWidgets: Array<Tables["UserWidget"]["widget"]>;
	maxWidgets: MaxWidgets;
	isSupporter: boolean;
	onAddWidget: (widgetId: string) => void;
}

function AvailableWidgetsList({
	selectedWidgets,
	mainWidgets,
	sideWidgets,
	maxWidgets,
	isSupporter,
	onAddWidget,
}: AvailableWidgetsListProps) {
	const { t } = useTranslation(["user"]);
	const [searchValue, setSearchValue] = useState("");

	const widgetsByCategory = ALL_WIDGETS;
	const categoryKeys = (
		Object.keys(widgetsByCategory) as Array<keyof typeof widgetsByCategory>
	).sort((a, b) => a.localeCompare(b));

	const searchLower = searchValue.trim().toLowerCase();

	const widgetMatchesSearch = (
		widget: (typeof ALL_WIDGETS)[keyof typeof ALL_WIDGETS][number],
		categoryName: string,
	) => {
		if (!searchLower) return true;

		return [
			t(widgetNameKey(widget.id)),
			t(
				`user:widgets.description.${widget.id}` as const,
				widgetDescriptionParams(widget.id),
			),
			categoryName,
		].some((text) => text.toLowerCase().includes(searchLower));
	};

	return (
		<div>
			<Input
				className={styles.searchInput}
				icon={<SearchIcon className={styles.searchIcon} />}
				value={searchValue}
				onChange={(e) => setSearchValue(e.target.value)}
				placeholder={t("user:widgets.search")}
			/>
			{categoryKeys.map((category) => {
				const categoryName = t(`user:widgets.category.${category}`);
				const filteredWidgets = widgetsByCategory[category]!.filter((widget) =>
					widgetMatchesSearch(widget, categoryName),
				);

				if (filteredWidgets.length === 0) return null;

				return (
					<div key={category} className={styles.categoryGroup}>
						<div className={styles.categoryTitle}>{categoryName}</div>
						{filteredWidgets.map((widget) => {
							const isSelected = selectedWidgets.some(
								(w) => w.id === widget.id,
							);
							const currentCount =
								widget.slot === "main"
									? mainWidgets.length
									: sideWidgets.length;
							const maxCount =
								widget.slot === "main" ? maxWidgets.main : maxWidgets.side;
							const isMaxReached = currentCount >= maxCount;
							const isLocked = Boolean(widget.supporterOnly) && !isSupporter;

							return (
								<div key={widget.id} className={styles.widgetCard}>
									<div className={styles.widgetHeader}>
										<span className={styles.widgetName}>
											<WidgetNavIcon navItem={widget.navItem} />
											{t(widgetNameKey(widget.id))}
										</span>
										{isLocked ? (
											<Link
												to={SUPPORT_PAGE}
												className={styles.supporterOnly}
												data-testid={`supporter-only-${widget.id}`}
											>
												{t("user:widgets.supporterOnly")}
											</Link>
										) : (
											<SendouButton
												size="miniscule"
												variant="outlined"
												onClick={() => onAddWidget(widget.id)}
												isDisabled={isSelected || isMaxReached}
												testId={`add-widget-${widget.id}`}
											>
												{isSelected
													? t("user:widgets.added")
													: isMaxReached
														? t("user:widgets.maxReached")
														: t("user:widgets.add")}
											</SendouButton>
										)}
									</div>
									<div className={styles.widgetFooter}>
										<div className={styles.widgetSlot}>
											{widget.slot === "main" ? (
												<>
													<MainSlotIcon size={16} />
													<span>{t("user:widgets.main")}</span>
												</>
											) : (
												<>
													<SideSlotIcon size={16} />
													<span>{t("user:widgets.side")}</span>
												</>
											)}
										</div>
										<div className="text-xs font-bold">{"//"}</div>
										<div className={styles.widgetDescription}>
											{t(
												`user:widgets.description.${widget.id}` as const,
												widgetDescriptionParams(widget.id),
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

interface SelectedWidgetsListProps {
	mainWidgets: Array<Tables["UserWidget"]["widget"]>;
	sideWidgets: Array<Tables["UserWidget"]["widget"]>;
	maxWidgets: MaxWidgets;
	onRemoveWidget: (widgetId: string) => void;
	onSettingsChange: (widgetId: string, settings: any) => void;
	expandedWidgetId: string | null;
	onToggleExpanded: (widgetId: string) => void;
}

function SelectedWidgetsList({
	mainWidgets,
	sideWidgets,
	maxWidgets,
	onRemoveWidget,
	onSettingsChange,
	expandedWidgetId,
	onToggleExpanded,
}: SelectedWidgetsListProps) {
	const { t } = useTranslation(["user"]);

	return (
		<div className={styles.selectedWidgetsList}>
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
								/>
							))
						)}
					</div>
				</SortableContext>
			</div>
		</div>
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
}

function DraggableWidgetItem({
	widget,
	onRemove,
	onSettingsChange,
	isExpanded,
	onToggleExpanded,
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
				<span className={styles.widgetName} {...listeners}>
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
					/>
				</div>
			) : null}
		</div>
	);
}

function WidgetNavIcon({ navItem }: { navItem?: string }) {
	if (!navItem) return null;

	return (
		<Image
			path={navIconUrl(navItem)}
			alt=""
			width={18}
			height={18}
			containerClassName={styles.widgetIcon}
		/>
	);
}

/** Widgets whose name is shared with another one, spelled out so the editor lists stay unambiguous. */
const EDITOR_WIDGET_NAME_KEYS = {
	"bio-md": "user:widgets.editorName.bio-md",
	"game-badges-small": "user:widgets.editorName.game-badges-small",
} as const;

function widgetNameKey(widgetId: WidgetId) {
	return widgetId in EDITOR_WIDGET_NAME_KEYS
		? EDITOR_WIDGET_NAME_KEYS[widgetId as keyof typeof EDITOR_WIDGET_NAME_KEYS]
		: (`user:widget.${widgetId}` as const);
}

const WIDGET_DESCRIPTION_PARAMS: Record<string, Record<string, unknown>> = {
	"game-badges": { max: USER.GAME_BADGES_MAX },
	"game-badges-small": { max: USER.GAME_BADGES_SMALL_MAX },
};

function widgetDescriptionParams(widgetId: string) {
	return WIDGET_DESCRIPTION_PARAMS[widgetId];
}

function scrollToFirstWidgetError(container: HTMLDivElement | null) {
	const target = container?.querySelector<HTMLElement>('[id$="-error"]');
	target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function computeInvalidWidgetIds(
	widgets: Array<Tables["UserWidget"]["widget"]>,
): Set<string> {
	const invalid = new Set<string>();
	for (const widget of widgets) {
		const schema = getWidgetFormSchema(widget.id);
		if (!schema) continue;
		if (!v.safeParse(schema, widget.settings ?? {}).success) {
			invalid.add(widget.id);
		}
	}
	return invalid;
}
