import clsx from "clsx";
import { ArrowLeft, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import type { Tables } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { split, startsWith } from "~/utils/strings";
import { assertType } from "~/utils/types";
import { modeImageUrl, stageImageUrl } from "~/utils/urls";
import { SendouButton } from "./elements/Button";

import styles from "./MapPoolSelector.module.css";

export type MapPoolSelectorProps = {
	mapPool: MapPool;
	preselectedMapPool?: MapPool;
	handleRemoval?: () => void;
	handleMapPoolChange: (
		mapPool: MapPool,
		event?: Pick<Tables["CalendarEvent"], "id" | "name">,
	) => void;
	className?: string;
	title?: string;
	modesToInclude?: ModeShort[];
	info?: React.ReactNode;
	footer?: React.ReactNode;
	/** Enables clear button, template selection, and toggling a whole stage */
	allowBulkEdit?: boolean;
	hideBanned?: boolean;
};

export function MapPoolSelector({
	mapPool,
	preselectedMapPool,
	handleMapPoolChange,
	handleRemoval,
	className,
	title,
	modesToInclude,
	info,
	footer,
	allowBulkEdit = false,
	hideBanned = false,
}: MapPoolSelectorProps) {
	const { t } = useTranslation();

	const [template, setTemplate] = React.useState<MapPoolTemplateValue>(
		detectTemplate(mapPool),
	);

	const handleStageModesChange = (newMapPool: MapPool) => {
		setTemplate(detectTemplate(newMapPool));
		handleMapPoolChange(newMapPool);
	};

	const handleClear = () => {
		setTemplate("none");
		handleMapPoolChange(MapPool.EMPTY);
	};

	const handleTemplateChange = (template: MapPoolTemplateValue) => {
		setTemplate(template);

		if (template === "none") {
			return;
		}

		if (startsWith(template, "preset:")) {
			const [, presetId] = split(template, ":");

			handleMapPoolChange(MapPool[presetId]);
			return;
		}

		assertType<never, typeof template>();
	};

	return (
		<fieldset className={className}>
			{Boolean(title) && <legend>{title}</legend>}
			{Boolean(handleRemoval || allowBulkEdit) && (
				<div className="stack horizontal sm justify-end">
					{handleRemoval && (
						<SendouButton variant="minimal" onPress={handleRemoval}>
							{t("actions.remove")}
						</SendouButton>
					)}
					{allowBulkEdit && (
						<SendouButton
							variant="minimal-destructive"
							isDisabled={mapPool.isEmpty()}
							onPress={handleClear}
						>
							{t("actions.clear")}
						</SendouButton>
					)}
				</div>
			)}
			<div className="stack md">
				{allowBulkEdit && (
					<div className={styles.templateSelection}>
						<MapPoolTemplateSelect
							value={template}
							handleChange={handleTemplateChange}
						/>
					</div>
				)}
				{info}
				<MapPoolStages
					mapPool={mapPool}
					handleMapPoolChange={handleStageModesChange}
					allowBulkEdit={allowBulkEdit}
					modesToInclude={modesToInclude}
					preselectedMapPool={preselectedMapPool}
					hideBanned={hideBanned}
				/>
				{footer}
			</div>
		</fieldset>
	);
}

export type MapPoolStagesProps = {
	mapPool: MapPool;
	handleMapPoolChange?: (newMapPool: MapPool) => void;
	allowBulkEdit?: boolean;
	modesToInclude?: ModeShort[];
	preselectedMapPool?: MapPool;
	hideBanned?: boolean;
};

export function MapPoolStages({
	mapPool,
	handleMapPoolChange,
	allowBulkEdit = false,
	modesToInclude,
	preselectedMapPool,
	hideBanned = false,
}: MapPoolStagesProps) {
	const { t } = useTranslation(["game-misc", "common"]);

	const isPresentational = !handleMapPoolChange;

	const stageRowIsVisible = (stageId: StageId) => {
		if (!isPresentational) return true;

		return mapPool.hasStage(stageId);
	};

	const handleModeChange = ({
		mode,
		stageId,
	}: {
		mode: ModeShort;
		stageId: StageId;
	}) => {
		const newMapPool = mapPool.parsed[mode].includes(stageId)
			? new MapPool({
					...mapPool.parsed,
					[mode]: mapPool.parsed[mode].filter((id) => id !== stageId),
				})
			: new MapPool({
					...mapPool.parsed,
					[mode]: [...mapPool.parsed[mode], stageId],
				});

		handleMapPoolChange?.(newMapPool);
	};

	const handleStageClear = (stageId: StageId) => {
		const newMapPool = new MapPool({
			TW: mapPool.parsed.TW.filter((id) => id !== stageId),
			SZ: mapPool.parsed.SZ.filter((id) => id !== stageId),
			TC: mapPool.parsed.TC.filter((id) => id !== stageId),
			RM: mapPool.parsed.RM.filter((id) => id !== stageId),
			CB: mapPool.parsed.CB.filter((id) => id !== stageId),
		});

		handleMapPoolChange?.(newMapPool);
	};

	const handleStageAdd = (stageId: StageId) => {
		const newMapPool = new MapPool({
			TW: [...mapPool.parsed.TW, stageId],
			SZ: [...mapPool.parsed.SZ, stageId],
			TC: [...mapPool.parsed.TC, stageId],
			RM: [...mapPool.parsed.RM, stageId],
			CB: [...mapPool.parsed.CB, stageId],
		});

		handleMapPoolChange?.(newMapPool);
	};

	const id = React.useId();

	return (
		<div className="stack md">
			{stageIds.filter(stageRowIsVisible).map((stageId) => (
				<div key={stageId} className={styles.stageRow}>
					<Image
						className={styles.stageImage}
						alt=""
						path={stageImageUrl(stageId)}
						width={80}
						height={45}
					/>
					{/** biome-ignore lint/a11y/useSemanticElements: todo */}
					<div
						className={styles.stageNameRow}
						role="group"
						aria-labelledby={`${id}-stage-name-${stageId}`}
					>
						<div id={`${id}-stage-name-${stageId}`}>
							{t(`game-misc:STAGE_${stageId}`)}
						</div>
						<div className={styles.modeButtonsContainer}>
							{modesShort
								.filter(
									(mode) => !modesToInclude || modesToInclude.includes(mode),
								)
								.map((mode) => {
									const selected = mapPool.has({ stageId, mode });

									if (isPresentational && !selected) return null;
									if (isPresentational && selected) {
										return (
											<Image
												key={mode}
												className={clsx(styles.mode, {
													[styles.selected]: selected,
												})}
												title={t(`game-misc:MODE_LONG_${mode}`)}
												alt={t(`game-misc:MODE_LONG_${mode}`)}
												path={modeImageUrl(mode)}
												width={33}
												height={33}
											/>
										);
									}

									const preselected = preselectedMapPool?.has({
										stageId,
										mode,
									});

									return (
										<button
											key={mode}
											className={clsx(styles.modeButton, {
												[styles.selected]: selected,
												[styles.preselected]: preselected,
												invisible:
													hideBanned && BANNED_MAPS[mode].includes(stageId),
											})}
											onClick={() => handleModeChange?.({ mode, stageId })}
											type="button"
											title={t(`game-misc:MODE_LONG_${mode}`)}
											aria-describedby={`${id}-stage-name-${stageId}`}
											aria-pressed={selected}
											disabled={preselected}
										>
											<Image
												className={clsx(styles.mode, {
													[styles.selected]: selected,
													[styles.preselected]: preselected,
												})}
												alt={t(`game-misc:MODE_LONG_${mode}`)}
												path={modeImageUrl(mode)}
												width={20}
												height={20}
											/>
										</button>
									);
								})}
							{!isPresentational &&
								allowBulkEdit &&
								(mapPool.hasStage(stageId) ? (
									<SendouButton
										key="clear"
										onPress={() => handleStageClear(stageId)}
										icon={<X />}
										variant="minimal"
										aria-label={t("common:actions.remove")}
										size="small"
									/>
								) : (
									<SendouButton
										key="select-all"
										onPress={() => handleStageAdd(stageId)}
										icon={<ArrowLeft />}
										variant="minimal"
										aria-label={t("common:actions.selectAll")}
										size="small"
									/>
								))}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

type MapModePresetId = "ANARCHY" | "ALL" | ModeShort;

const presetIds: MapModePresetId[] = ["ANARCHY", "ALL", ...modesShort];

type MapPoolTemplateValue = "none" | `preset:${MapModePresetId}`;

function detectTemplate(mapPool: MapPool): MapPoolTemplateValue {
	for (const presetId of presetIds) {
		if (MapPool[presetId].serialized === mapPool.serialized) {
			return `preset:${presetId}`;
		}
	}
	return "none";
}

type MapPoolTemplateSelectProps = {
	value: MapPoolTemplateValue;
	handleChange: (newValue: MapPoolTemplateValue) => void;
	recentEvents?: Pick<Tables["CalendarEvent"], "id" | "name">[];
};

function MapPoolTemplateSelect({
	handleChange,
	value,
	recentEvents,
}: MapPoolTemplateSelectProps) {
	const { t } = useTranslation(["game-misc", "common"]);

	return (
		<label className="stack sm">
			{t("common:maps.template")}
			<select
				value={value}
				onChange={(e) => {
					handleChange(e.currentTarget.value as MapPoolTemplateValue);
				}}
			>
				<option value="none">{t("common:maps.template.none")}</option>
				<optgroup label={t("common:maps.template.presets")}>
					{(["ANARCHY", "ALL"] as const).map((presetId) => (
						<option key={presetId} value={`preset:${presetId}`}>
							{t(`common:maps.template.preset.${presetId}`)}
						</option>
					))}
					{modesShort.map((mode) => (
						<option key={mode} value={`preset:${mode}`}>
							{t("common:maps.template.preset.onlyMode", {
								modeName: t(`game-misc:MODE_LONG_${mode}`),
							})}
						</option>
					))}
				</optgroup>
				{recentEvents && recentEvents.length > 0 && (
					<optgroup label={t("common:maps.template.yourRecentEvents")}>
						{recentEvents.map((event) => (
							<option key={event.id} value={`recent-event:${event.id}`}>
								{event.name}
							</option>
						))}
					</optgroup>
				)}
			</select>
		</label>
	);
}
