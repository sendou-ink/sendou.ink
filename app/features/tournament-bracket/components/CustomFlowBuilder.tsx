import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { GripVertical, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import {
	ACTION_TYPES,
	type ActionType,
	type CustomPickBanFlow,
	type CustomPickBanStep,
	WHO_SIDES,
	type WhoSide,
} from "~/db/tables";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
import {
	type CustomFlowValidationError,
	validateCustomFlowSection,
} from "../core/PickBan";
import styles from "./CustomFlowBuilder.module.css";

const WHO_I18N_KEYS = {
	ALPHA: "tournament:customFlow.who.ALPHA",
	BRAVO: "tournament:customFlow.who.BRAVO",
	HIGHER_SEED: "tournament:customFlow.who.HIGHER_SEED",
	LOWER_SEED: "tournament:customFlow.who.LOWER_SEED",
	WINNER: "tournament:customFlow.who.WINNER",
	LOSER: "tournament:customFlow.who.LOSER",
} as const;

const ACTION_I18N_KEYS = {
	ROLL: "tournament:customFlow.action.ROLL",
	PICK: "tournament:customFlow.action.PICK",
	BAN: "tournament:customFlow.action.BAN",
	MODE_PICK: "tournament:customFlow.action.MODE_PICK",
	MODE_BAN: "tournament:customFlow.action.MODE_BAN",
} as const;

const BEFORE_SET_INVALID_WHO: ReadonlySet<WhoSide> = new Set([
	"WINNER",
	"LOSER",
]);

function validationErrorToI18nKey(error: CustomFlowValidationError) {
	switch (error) {
		case "STEP_MISSING_ACTION":
			return "tournament:customFlow.validation.stepMissingAction" as const;
		case "STEP_MISSING_WHO":
			return "tournament:customFlow.validation.stepMissingWho" as const;
		case "LAST_STEP_MUST_BE_PICK_OR_ROLL":
			return "tournament:customFlow.validation.lastStepMustBePickOrRoll" as const;
		case "WINNER_LOSER_IN_PRE_SET":
			return "tournament:customFlow.validation.winnerLoserInPreSet" as const;
		case "TOO_MANY_MODE_PICKS":
			return "tournament:customFlow.validation.tooManyModePicks" as const;
		case "TOO_MANY_MAP_PICKS":
			return "tournament:customFlow.validation.tooManyMapPicks" as const;
		case "SAME_TEAM_MODE_AND_MAP_PICK":
			return "tournament:customFlow.validation.sameTeamModeAndMapPick" as const;
	}
}

interface PartialStep {
	id: string;
	action?: ActionType;
	side?: WhoSide;
}

export function CustomFlowBuilder({
	value,
	onChange,
}: {
	value: CustomPickBanFlow | null;
	onChange: (flow: CustomPickBanFlow | null) => void;
}) {
	const { t } = useTranslation(["tournament"]);
	const [preSetSteps, setPreSetSteps] = React.useState<PartialStep[]>(() =>
		value?.preSet.length
			? value.preSet.map((s) => ({ id: nanoid(), ...s }))
			: [{ id: nanoid() }],
	);
	const [postGameSteps, setPostGameSteps] = React.useState<PartialStep[]>(() =>
		value?.postGame.length
			? value.postGame.map((s) => ({ id: nanoid(), ...s }))
			: [{ id: nanoid() }],
	);
	const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
	const [dragOverInfo, setDragOverInfo] = React.useState<{
		overId: string;
		valid: boolean;
	} | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const syncFlow = (newPreSet: PartialStep[], newPostGame: PartialStep[]) => {
		const preSetComplete = stepsToFlow(newPreSet);
		const postGameComplete = stepsToFlow(newPostGame);

		if (preSetComplete && postGameComplete) {
			onChange({ preSet: preSetComplete, postGame: postGameComplete });
		} else {
			onChange(null);
		}
	};

	const updatePreSetSteps = (newSteps: PartialStep[]) => {
		setPreSetSteps(newSteps);
		syncFlow(newSteps, postGameSteps);
	};

	const updatePostGameSteps = (newSteps: PartialStep[]) => {
		setPostGameSteps(newSteps);
		syncFlow(preSetSteps, newSteps);
	};

	const handleDragStart = (event: DragStartEvent) => {
		setActiveDragId(String(event.active.id));
	};

	const handleDragOver = (event: DragOverEvent) => {
		if (!event.over || !activeDragId) {
			setDragOverInfo(null);
			return;
		}

		const overId = String(event.over.id);
		const valid = isDropValid(activeDragId, overId);
		setDragOverInfo({ overId, valid });
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveDragId(null);
		setDragOverInfo(null);

		const { active, over } = event;
		if (!over) return;

		const activeId = String(active.id);
		const overId = String(over.id);

		// palette chip drop onto a slot
		if (activeId.startsWith("palette-")) {
			handlePaletteDrop(activeId, overId);
			return;
		}

		// row reordering within a section
		handleRowReorder(activeId, overId);
	};

	const handlePaletteDrop = (activeId: string, overId: string) => {
		const chipType = activeId.replace("palette-", "");
		const isWhoChip = WHO_SIDES.includes(chipType as WhoSide);
		const isActionChip = ACTION_TYPES.includes(chipType as ActionType);

		const dropParts = overId.split("-");
		const section = dropParts[0];
		const stepIdx = Number(dropParts[1]);
		const slotType = dropParts[2]; // "who" or "action"

		if (slotType === "who" && !isWhoChip) return;
		if (slotType === "action" && !isActionChip) return;

		// validate Winner/Loser in Before set
		if (
			section === "preSet" &&
			slotType === "who" &&
			isWhoChip &&
			BEFORE_SET_INVALID_WHO.has(chipType as WhoSide)
		) {
			return;
		}

		const steps = section === "preSet" ? preSetSteps : postGameSteps;
		const setSteps =
			section === "preSet" ? updatePreSetSteps : updatePostGameSteps;

		const newSteps = [...steps];
		const step = { ...newSteps[stepIdx] };

		if (slotType === "who") {
			step.side = chipType as WhoSide;
		} else {
			step.action = chipType as ActionType;
			if (chipType === "ROLL") {
				step.side = undefined;
			}
		}

		newSteps[stepIdx] = step;
		setSteps(newSteps);
	};

	const handleRowReorder = (activeId: string, overId: string) => {
		if (!activeId.startsWith("row-") || !overId.startsWith("row-")) return;

		const activeParts = activeId.split("-");
		const overParts = overId.split("-");
		const activeSection = activeParts[1];
		const overSection = overParts[1];

		if (activeSection !== overSection) return;

		const activeIdx = Number(activeParts[2]);
		const overIdx = Number(overParts[2]);

		if (activeIdx === overIdx) return;

		const steps = activeSection === "preSet" ? preSetSteps : postGameSteps;
		const setSteps =
			activeSection === "preSet" ? updatePreSetSteps : updatePostGameSteps;

		setSteps(arrayMove(steps, activeIdx, overIdx));
	};

	const layoutSize = useLayoutSize();
	const isMobile = layoutSize === "mobile";

	const preSetErrors = validateCustomFlowSection(preSetSteps, "preSet").map(
		(e) => t(validationErrorToI18nKey(e)),
	);
	const postGameErrors = validateCustomFlowSection(
		postGameSteps,
		"postGame",
	).map((e) => t(validationErrorToI18nKey(e)));

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={pointerWithin}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className={styles.container}>
				<ChipPalette />

				{isMobile ? (
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="preSet">
								{t("tournament:customFlow.beforeSet")}
							</SendouTab>
							<SendouTab id="postGame">
								{t("tournament:customFlow.afterMap")}
							</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="preSet">
							<StepListSection
								section="preSet"
								steps={preSetSteps}
								onStepsChange={updatePreSetSteps}
								errors={preSetErrors}
								dragOverInfo={dragOverInfo}
							/>
						</SendouTabPanel>
						<SendouTabPanel id="postGame">
							<StepListSection
								section="postGame"
								steps={postGameSteps}
								onStepsChange={updatePostGameSteps}
								errors={postGameErrors}
								dragOverInfo={dragOverInfo}
							/>
						</SendouTabPanel>
					</SendouTabs>
				) : (
					<div className={styles.sections}>
						<StepListSection
							title={t("tournament:customFlow.beforeSet")}
							section="preSet"
							steps={preSetSteps}
							onStepsChange={updatePreSetSteps}
							errors={preSetErrors}
							dragOverInfo={dragOverInfo}
						/>
						<StepListSection
							title={t("tournament:customFlow.afterMap")}
							section="postGame"
							steps={postGameSteps}
							onStepsChange={updatePostGameSteps}
							errors={postGameErrors}
							dragOverInfo={dragOverInfo}
						/>
					</div>
				)}
			</div>

			<DragOverlay className={styles.overlay}>
				{activeDragId ? <DragOverlayChip dragId={activeDragId} /> : null}
			</DragOverlay>
		</DndContext>
	);
}

function ChipPalette() {
	const { t } = useTranslation(["tournament"]);

	return (
		<div className={styles.palette}>
			<div className={styles.paletteGroup}>
				<span className={styles.paletteLabel}>
					{t("tournament:customFlow.who")}
				</span>
				{WHO_SIDES.map((who) => (
					<PaletteChip
						key={who}
						id={`palette-${who}`}
						type="who"
						label={t(WHO_I18N_KEYS[who])}
					/>
				))}
			</div>
			<div className={styles.paletteGroup}>
				<span className={styles.paletteLabel}>
					{t("tournament:customFlow.action")}
				</span>
				{ACTION_TYPES.map((action) => (
					<PaletteChip
						key={action}
						id={`palette-${action}`}
						type="action"
						label={t(ACTION_I18N_KEYS[action])}
					/>
				))}
			</div>
		</div>
	);
}

function PaletteChip({
	id,
	type,
	label,
}: {
	id: string;
	type: "who" | "action";
	label: string;
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id,
	});

	return (
		<div
			ref={setNodeRef}
			className={clsx(styles.chip, {
				[styles.chipWho]: type === "who",
				[styles.chipAction]: type === "action",
				[styles.chipDragging]: isDragging,
			})}
			{...listeners}
			{...attributes}
		>
			{label}
		</div>
	);
}

function StepListSection({
	title,
	section,
	steps,
	onStepsChange,
	errors,
	dragOverInfo,
}: {
	title?: string;
	section: "preSet" | "postGame";
	steps: PartialStep[];
	onStepsChange: (steps: PartialStep[]) => void;
	errors: string[];
	dragOverInfo: { overId: string; valid: boolean } | null;
}) {
	const { t } = useTranslation(["tournament"]);

	const addStep = () => {
		onStepsChange([...steps, { id: nanoid() }]);
	};

	const removeStep = (idx: number) => {
		if (steps.length <= 1) return;
		onStepsChange(steps.filter((_, i) => i !== idx));
	};

	const sortableIds = steps.map((_, i) => `row-${section}-${i}`);

	return (
		<div className={styles.section}>
			{title ? <div className={styles.sectionHeader}>{title}</div> : null}
			<SortableContext
				items={sortableIds}
				strategy={verticalListSortingStrategy}
			>
				<div className={styles.stepList}>
					{steps.map((step, i) => (
						<StepRow
							key={step.id}
							step={step}
							index={i}
							section={section}
							canRemove={steps.length > 1}
							onRemove={() => removeStep(i)}
							dragOverInfo={dragOverInfo}
						/>
					))}
				</div>
			</SortableContext>
			<SendouButton
				className={styles.addStepButton}
				size="small"
				variant="outlined"
				icon={<Plus />}
				onPress={addStep}
			>
				{t("tournament:customFlow.addStep")}
			</SendouButton>
			{errors.map((error) => (
				<div key={error} className={styles.validationError}>
					{error}
				</div>
			))}
		</div>
	);
}

function StepRow({
	step,
	index,
	section,
	canRemove,
	onRemove,
	dragOverInfo,
}: {
	step: PartialStep;
	index: number;
	section: "preSet" | "postGame";
	canRemove: boolean;
	onRemove: () => void;
	dragOverInfo: { overId: string; valid: boolean } | null;
}) {
	const sortableId = `row-${section}-${index}`;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: sortableId });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const { t } = useTranslation(["tournament"]);
	const isRoll = step.action === "ROLL";
	const whoDropId = `${section}-${index}-who`;
	const actionDropId = `${section}-${index}-action`;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={clsx(styles.stepRow, {
				[styles.stepRowDragging]: isDragging,
			})}
		>
			<button
				type="button"
				className={styles.dragHandle}
				{...listeners}
				{...attributes}
			>
				<GripVertical size={16} />
			</button>
			{isRoll ? null : (
				<DropZone
					id={whoDropId}
					type="who"
					filled={step.side}
					label={step.side ? t(WHO_I18N_KEYS[step.side]) : undefined}
					dragOverInfo={dragOverInfo}
				/>
			)}
			<DropZone
				id={actionDropId}
				type="action"
				filled={step.action}
				label={step.action ? t(ACTION_I18N_KEYS[step.action]) : undefined}
				dragOverInfo={dragOverInfo}
			/>
			<button
				type="button"
				className={clsx(styles.removeButton, {
					[styles.removeButtonHidden]: !canRemove,
				})}
				onClick={onRemove}
				aria-label="Remove step"
			>
				<X size={14} />
			</button>
		</div>
	);
}

function DropZone({
	id,
	type,
	filled,
	label,
	dragOverInfo,
}: {
	id: string;
	type: "who" | "action";
	filled?: string;
	label?: string;
	dragOverInfo: { overId: string; valid: boolean } | null;
}) {
	const { t } = useTranslation(["tournament"]);
	const { setNodeRef, isOver } = useDroppable({ id });

	const isTargeted = dragOverInfo?.overId === id;
	const isValid = isTargeted ? dragOverInfo.valid : true;

	return (
		<div
			ref={setNodeRef}
			className={clsx(styles.dropZone, {
				[styles.dropZoneWho]: type === "who",
				[styles.dropZoneAction]: type === "action",
				[styles.dropZoneOver]: isOver && isValid,
				[styles.dropZoneInvalid]: isOver && !isValid,
				[styles.dropZoneFilled]: Boolean(filled),
			})}
		>
			{label ??
				(type === "who"
					? t("tournament:customFlow.whoPlaceholder")
					: t("tournament:customFlow.actionPlaceholder"))}
		</div>
	);
}

function DragOverlayChip({ dragId }: { dragId: string }) {
	const { t } = useTranslation(["tournament"]);

	if (dragId.startsWith("palette-")) {
		const chipType = dragId.replace("palette-", "");
		const isWho = WHO_SIDES.includes(chipType as WhoSide);
		const label = isWho
			? t(WHO_I18N_KEYS[chipType as WhoSide])
			: t(ACTION_I18N_KEYS[chipType as ActionType]);

		return (
			<div
				className={clsx(styles.chip, {
					[styles.chipWho]: isWho,
					[styles.chipAction]: !isWho,
				})}
			>
				{label}
			</div>
		);
	}

	return null;
}

function isDropValid(activeId: string, overId: string): boolean {
	if (!activeId.startsWith("palette-")) return true;

	const chipType = activeId.replace("palette-", "");
	const isWhoChip = WHO_SIDES.includes(chipType as WhoSide);
	const isActionChip = ACTION_TYPES.includes(chipType as ActionType);

	const dropParts = overId.split("-");
	const section = dropParts[0];
	const slotType = dropParts[2];

	if (slotType === "who" && !isWhoChip) return false;
	if (slotType === "action" && !isActionChip) return false;

	if (
		section === "preSet" &&
		slotType === "who" &&
		isWhoChip &&
		BEFORE_SET_INVALID_WHO.has(chipType as WhoSide)
	) {
		return false;
	}

	return true;
}

function stepsToFlow(steps: PartialStep[]): CustomPickBanStep[] | null {
	const result: CustomPickBanStep[] = [];
	for (const step of steps) {
		if (!step.action) return null;
		if (step.action !== "ROLL" && !step.side) return null;
		result.push({
			action: step.action,
			side: step.action === "ROLL" ? undefined : step.side,
		});
	}
	return result;
}
