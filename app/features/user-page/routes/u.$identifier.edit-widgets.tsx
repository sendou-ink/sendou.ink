import type { DragEndEvent } from "@dnd-kit/core";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { MainSlotIcon } from "~/components/icons/MainSlot";
import { SideSlotIcon } from "~/components/icons/SideSlot";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { ALL_WIDGETS } from "~/features/user-page/core/widgets/portfolio";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { USER } from "~/features/user-page/user-page-constants";
import { widgetsEditSchema } from "~/features/user-page/user-page-schemas";
import { parseRequestPayload } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import styles from "./u.$identifier.edit-widgets.module.css";

// xxx: move action and loader to different file

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const currentWidgets = await UserRepository.storedWidgetsByUserId(user.id);

	return { currentWidgets };
};

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);

	const payload = await parseRequestPayload({
		request,
		schema: widgetsEditSchema,
	});

	await UserRepository.upsertWidgets(user.id, payload.widgets);

	return redirect(userPage(user));
};

export default function EditWidgetsPage() {
	const { t } = useTranslation(["user", "common"]);
	const data = useLoaderData<typeof loader>();

	const [selectedWidgets, setSelectedWidgets] = useState<
		Array<Tables["UserWidget"]["widget"]>
	>(data.currentWidgets);

	const mainWidgets = selectedWidgets.filter((w) => {
		const def = ALL_WIDGETS.find((widget) => widget.id === w.id);
		return def?.slot === "main";
	});

	const sideWidgets = selectedWidgets.filter((w) => {
		const def = ALL_WIDGETS.find((widget) => widget.id === w.id);
		return def?.slot === "side";
	});

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

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
		const widget = ALL_WIDGETS.find((w) => w.id === widgetId);
		if (!widget) return;

		const currentCount =
			widget.slot === "main" ? mainWidgets.length : sideWidgets.length;
		const maxCount =
			widget.slot === "main" ? USER.MAX_MAIN_WIDGETS : USER.MAX_SIDE_WIDGETS;

		if (currentCount >= maxCount) return;

		setSelectedWidgets([
			...selectedWidgets,
			{ id: widgetId as typeof widget.id },
		]);
	};

	const removeWidget = (widgetId: string) => {
		setSelectedWidgets(selectedWidgets.filter((w) => w.id !== widgetId));
	};

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1>{t("user:widgets.editTitle")}</h1>
				<div className={styles.actions}>
					{/* xxx: Do we want cancel? */}
					{/* <Link to={`/u/${data.identifier}`}>
						<SendouButton variant="minimal">
							{t("common:actions.cancel")}
						</SendouButton>
					</Link> */}
					<SendouButton type="submit" form="widget-form">
						{t("common:actions.save")}
					</SendouButton>
				</div>
			</header>

			<Form method="post" id="widget-form" className={styles.content}>
				<input
					type="hidden"
					name="widgets"
					value={JSON.stringify(selectedWidgets)}
				/>

				<div className={styles.grid}>
					<section className={styles.selected}>
						<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
							<SelectedWidgetsList
								mainWidgets={mainWidgets}
								sideWidgets={sideWidgets}
								onRemoveWidget={removeWidget}
							/>
						</DndContext>
					</section>

					<section className={styles.available}>
						<h2>{t("user:widgets.available")}</h2>
						<AvailableWidgetsList
							selectedWidgets={selectedWidgets}
							mainWidgets={mainWidgets}
							sideWidgets={sideWidgets}
							onAddWidget={addWidget}
						/>
					</section>
				</div>
			</Form>
		</div>
	);
}

interface AvailableWidgetsListProps {
	selectedWidgets: Array<Tables["UserWidget"]["widget"]>;
	mainWidgets: Array<Tables["UserWidget"]["widget"]>;
	sideWidgets: Array<Tables["UserWidget"]["widget"]>;
	onAddWidget: (widgetId: string) => void;
}

function AvailableWidgetsList({
	selectedWidgets,
	mainWidgets,
	sideWidgets,
	onAddWidget,
}: AvailableWidgetsListProps) {
	const { t } = useTranslation(["user"]);

	const widgetsByCategory = R.groupBy(ALL_WIDGETS, (widget) => widget.category);
	const categoryKeys = (
		Object.keys(widgetsByCategory) as Array<keyof typeof widgetsByCategory>
	).sort((a, b) => a.localeCompare(b));

	return (
		<div>
			{categoryKeys.map((category) => (
				<div key={category} className={styles.categoryGroup}>
					<div className={styles.categoryTitle}>
						{t(`user:widgets.category.${category}`)}
					</div>
					{widgetsByCategory[category]!.map((widget) => {
						const isSelected = selectedWidgets.some((w) => w.id === widget.id);
						const currentCount =
							widget.slot === "main" ? mainWidgets.length : sideWidgets.length;
						const maxCount =
							widget.slot === "main"
								? USER.MAX_MAIN_WIDGETS
								: USER.MAX_SIDE_WIDGETS;
						const isMaxReached = currentCount >= maxCount;

						return (
							<div key={widget.id} className={styles.widgetCard}>
								<div className={styles.widgetHeader}>
									<span className={styles.widgetName}>
										{t(`user:widget.${widget.id}` as const)}
									</span>
									<SendouButton
										size="miniscule"
										variant="outlined"
										onPress={() => onAddWidget(widget.id)}
										isDisabled={isSelected || isMaxReached}
									>
										{t("user:widgets.add")}
									</SendouButton>
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
										{t(`user:widgets.description.${widget.id}` as const)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

interface SelectedWidgetsListProps {
	mainWidgets: Array<Tables["UserWidget"]["widget"]>;
	sideWidgets: Array<Tables["UserWidget"]["widget"]>;
	onRemoveWidget: (widgetId: string) => void;
}

function SelectedWidgetsList({
	mainWidgets,
	sideWidgets,
	onRemoveWidget,
}: SelectedWidgetsListProps) {
	const { t } = useTranslation(["user"]);

	return (
		<div className={styles.selectedWidgetsList}>
			<div className={styles.slotSection}>
				<div className={styles.slotHeader}>
					<span className="stack horizontal xs">
						<MainSlotIcon size={24} /> {t("user:widgets.mainSlot")}
					</span>
					<span className={styles.slotCount}>
						{mainWidgets.length}/{USER.MAX_MAIN_WIDGETS}
					</span>
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
								/>
							))
						)}
					</div>
				</SortableContext>
			</div>

			<div className={styles.slotSection}>
				<div className={styles.slotHeader}>
					<span className="stack horizontal xs">
						<SideSlotIcon size={24} /> {t("user:widgets.sideSlot")}
					</span>
					<span className={styles.slotCount}>
						{sideWidgets.length}/{USER.MAX_SIDE_WIDGETS}
					</span>
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
								/>
							))
						)}
					</div>
				</SortableContext>
			</div>
		</div>
	);
}

interface DraggableWidgetItemProps {
	widget: Tables["UserWidget"]["widget"];
	onRemove: (widgetId: string) => void;
}

function DraggableWidgetItem({ widget, onRemove }: DraggableWidgetItemProps) {
	const { t } = useTranslation(["user"]);
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

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`${styles.draggableWidget} ${isDragging ? styles.isDragging : ""}`}
			{...attributes}
		>
			<span className={styles.widgetName} {...listeners}>
				☰ {t(`user:widget.${widget.id}` as const)}
			</span>
			<SendouButton
				size="miniscule"
				variant="minimal-destructive"
				onPress={() => onRemove(widget.id)}
			>
				{t("user:widgets.remove")}
			</SendouButton>
		</div>
	);
}
