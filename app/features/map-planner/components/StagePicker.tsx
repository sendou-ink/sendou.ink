import { Map as MapIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, ModeImage, StageImage } from "~/components/Image";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { modeImageUrl } from "~/utils/urls";
import * as PlanCommands from "../core/PlanCommands";
import type { MapVariant, PlanDocument } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import styles from "./StagePicker.module.css";

const WATER_LEVELS = [
	{ variant: undefined, labelKey: "common:plans.waterLevel.up" },
	{ variant: "lowTide", labelKey: "common:plans.waterLevel.down" },
] as const satisfies Array<{
	variant: MapVariant | undefined;
	labelKey: string;
}>;

/**
 * Picks the map: a row of modes, the water level where a stage has one and a grid of stages.
 * Opens by itself while no map has been picked yet.
 */
export function StagePicker({
	editor,
	document,
	isMapShown,
	onMapPicked,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	/** `false` while no map has been picked yet. */
	isMapShown: boolean;
	onMapPicked: () => void;
}) {
	const { t } = useTranslation(["common", "game-misc"]);
	const [isOpen, setIsOpen] = React.useState(!isMapShown);
	const mode = document.objective.mode;

	return (
		<SendouPopover
			isOpen={isOpen}
			onOpenChange={setIsOpen}
			placement="bottom end"
			popoverClassName={styles.popover}
			trigger={
				<button
					type="button"
					className={styles.trigger}
					aria-label={t("common:plans.changeMap")}
					data-testid="plan-stage-picker-button"
				>
					{isMapShown ? (
						<StageImage stageId={document.stageId} width={64} />
					) : (
						<span className={styles.triggerPlaceholder}>
							<MapIcon />
						</span>
					)}
					<ModeImage mode={mode} size={20} className={styles.triggerMode} />
				</button>
			}
		>
			<div className={styles.picker}>
				<div className={styles.segments}>
					{modesShort.map((optionMode) => (
						<button
							key={optionMode}
							type="button"
							className={styles.segment}
							aria-pressed={optionMode === mode}
							onClick={() =>
								editor.apply(PlanCommands.switchMode(document, optionMode))
							}
							data-testid={`plan-mode-${optionMode}`}
						>
							<Image
								path={modeImageUrl(optionMode)}
								alt=""
								size={20}
								className={styles.segmentIcon}
							/>
							{t(`game-misc:MODE_LONG_${optionMode}`)}
						</button>
					))}
				</div>
				{PlanCommands.variantsOfStage(document.stageId).includes("lowTide") ? (
					<div className={styles.segments}>
						{WATER_LEVELS.map(({ variant, labelKey }) => (
							<button
								key={labelKey}
								type="button"
								className={styles.segment}
								aria-pressed={document.variant === variant}
								onClick={() =>
									editor.apply(
										PlanCommands.switchMap(document, {
											stageId: document.stageId,
											variant,
										}),
									)
								}
							>
								{t(labelKey)}
							</button>
						))}
					</div>
				) : null}
				<div className={styles.stages}>
					{stageIds.map((stageId) => (
						<button
							key={stageId}
							type="button"
							className={styles.stage}
							aria-pressed={isMapShown && stageId === document.stageId}
							onClick={() => {
								editor.apply(PlanCommands.switchMap(document, { stageId }));
								onMapPicked();
								setIsOpen(false);
							}}
							data-testid={`plan-stage-${stageId}`}
						>
							<StageImage
								stageId={stageId}
								width={144}
								className={styles.stageImage}
								containerClassName={styles.stageImageContainer}
							/>
							<span className={styles.stageName}>
								{t(`game-misc:STAGE_${stageId}`)}
							</span>
						</button>
					))}
				</div>
			</div>
		</SendouPopover>
	);
}
