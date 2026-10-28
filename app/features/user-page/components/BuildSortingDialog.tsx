import type { DragEndEvent } from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SubmitButton } from "~/components/SubmitButton";
import {
	BUILD_SORT_IDENTIFIERS,
	type BuildSort,
	DEFAULT_BUILD_SORT,
} from "../user-page-constants";
import { buildsActionSchema } from "../user-page-schemas";
import styles from "./BuildSortingDialog.module.css";

const BUILD_SORT_GROUPS = ["weapons", "gear", "other"] as const;

const BUILD_SORT_GROUP: Record<BuildSort, (typeof BUILD_SORT_GROUPS)[number]> =
	{
		WEAPON_POOL: "weapons",
		WEAPON_IN_GAME_ORDER: "weapons",
		TOP_500: "weapons",
		HEADGEAR_ID: "gear",
		CLOTHES_ID: "gear",
		SHOES_ID: "gear",
		UPDATED_AT: "other",
		ALPHABETICAL_TITLE: "other",
		MODE: "other",
		PUBLIC_BUILD: "other",
		PRIVATE_BUILD: "other",
	};

const MUTUALLY_EXCLUSIVE_SORT: Partial<Record<BuildSort, BuildSort>> = {
	PUBLIC_BUILD: "PRIVATE_BUILD",
	PRIVATE_BUILD: "PUBLIC_BUILD",
};

export function BuildSortingDialog({
	initialSorting,
	close,
	fetcher,
}: {
	initialSorting: ReadonlyArray<BuildSort> | null;
	close: () => void;
	fetcher: ReturnType<typeof useFetcher>;
}) {
	const { t } = useTranslation(["common", "user"]);
	const [buildSorting, setBuildSorting] = React.useState<BuildSort[]>(() => [
		...(initialSorting ?? DEFAULT_BUILD_SORT),
	]);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const unavailableSorts = new Set(buildSorting);
	for (const sort of buildSorting) {
		const excluded = MUTUALLY_EXCLUSIVE_SORT[sort];
		if (excluded) unavailableSorts.add(excluded);
	}

	const addableSortGroups = BUILD_SORT_GROUPS.map((group) => ({
		group,
		sorts: BUILD_SORT_IDENTIFIERS.filter(
			(sort) => BUILD_SORT_GROUP[sort] === group && !unavailableSorts.has(sort),
		),
	})).filter(({ sorts }) => sorts.length > 0);

	const moveSort = (fromIndex: number, toIndex: number) =>
		setBuildSorting((prev) => arrayMove(prev, fromIndex, toIndex));

	const removeSort = (sortToRemove: BuildSort) =>
		setBuildSorting((prev) => prev.filter((sort) => sort !== sortToRemove));

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;

		moveSort(
			buildSorting.indexOf(active.id as BuildSort),
			buildSorting.indexOf(over.id as BuildSort),
		);
	};

	return (
		<SendouDialog
			heading={t("user:builds.sorting.header")}
			onClose={close}
			className={styles.dialog}
		>
			<fetcher.Form
				method="post"
				onSubmit={() => close()}
				className={styles.form}
			>
				<input
					type="hidden"
					name="buildSorting"
					value={JSON.stringify(buildSorting)}
				/>
				<p className={styles.info}>{t("user:builds.sorting.info")}</p>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>
						<h3 className={styles.sectionHeading}>
							{t("user:builds.sorting.order")}
						</h3>
						<SendouButton
							variant="minimal"
							size="small"
							icon={<RotateCcw />}
							onClick={() => setBuildSorting([...DEFAULT_BUILD_SORT])}
						>
							{t("user:builds.sorting.backToDefaults")}
						</SendouButton>
					</div>

					{buildSorting.length === 0 ? (
						<div className={styles.empty}>{t("user:builds.sorting.empty")}</div>
					) : (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={buildSorting}
								strategy={verticalListSortingStrategy}
							>
								<ol className={styles.rules}>
									{buildSorting.map((sort, i) => (
										<SortableRule
											key={sort}
											sort={sort}
											position={i + 1}
											onRemove={() => removeSort(sort)}
										/>
									))}
								</ol>
							</SortableContext>
						</DndContext>
					)}
				</section>

				<section className={clsx(styles.section, styles.addSection)}>
					<h3 className={styles.sectionHeading}>
						{t("user:builds.sorting.addRule")}
					</h3>
					{addableSortGroups.length === 0 ? (
						<span className={styles.allInUse}>
							{t("user:builds.sorting.allInUse")}
						</span>
					) : (
						addableSortGroups.map(({ group, sorts }) => (
							<div key={group} className={styles.chipGroup}>
								<span className={styles.chipGroupLabel}>
									{t(`user:builds.sorting.group.${group}`)}
								</span>
								<div className={styles.chips}>
									{sorts.map((sort) => (
										<button
											key={sort}
											type="button"
											className={styles.chip}
											onClick={() => setBuildSorting((prev) => [...prev, sort])}
											data-testid={`add-sorting-${sort}`}
										>
											<Plus className={styles.chipIcon} aria-hidden />
											{t(`user:builds.sorting.${sort}`)}
										</button>
									))}
								</div>
							</div>
						))
					)}
				</section>

				<div className={styles.actions}>
					<SendouButton variant="outlined" onClick={close}>
						{t("common:actions.cancel")}
					</SendouButton>
					<SubmitButton schema={buildsActionSchema} _action="UPDATE_SORTING">
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</SendouDialog>
	);
}

function SortableRule({
	sort,
	position,
	onRemove,
}: {
	sort: BuildSort;
	position: number;
	onRemove: () => void;
}) {
	const { t } = useTranslation(["common", "user"]);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: sort });

	const label = t(`user:builds.sorting.${sort}`);

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={clsx(styles.rule, { [styles.isDragging]: isDragging })}
			data-testid="sorting-rule"
		>
			<button
				type="button"
				className={styles.dragHandle}
				aria-label={`${label} (drag to reorder)`}
				{...attributes}
				{...listeners}
			>
				<GripVertical aria-hidden />
			</button>
			<span className={styles.position}>{position}</span>
			<div className={styles.ruleText}>
				<span className={styles.ruleLabel}>{label}</span>
				<span className={styles.ruleDescription}>
					{t(`user:builds.sorting.desc.${sort}`)}
				</span>
			</div>
			<div className={styles.ruleActions}>
				<SendouButton
					variant="minimal-destructive"
					size="small"
					shape="square"
					icon={<X />}
					aria-label={`${t("common:actions.remove")} ${label}`}
					onClick={onRemove}
					data-testid="remove-sorting-button"
				/>
			</div>
		</li>
	);
}
