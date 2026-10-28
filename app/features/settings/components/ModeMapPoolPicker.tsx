import clsx from "clsx";
import { Check } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import { ModeImage } from "~/components/Image";
import { shortStageName, stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { nullFilledArray } from "~/utils/arrays";
import { stageImageUrl } from "~/utils/urls";
import styles from "./ModeMapPoolPicker.module.css";

export function ModeMapPoolPicker({
	mode,
	amountToPick,
	pool,
	allowedStages,
	onChange,
	disabled,
}: {
	mode: ModeShort;
	amountToPick: number;
	pool: StageId[];
	/** Stages that can be picked, the rest are not shown. */
	allowedStages: readonly StageId[];
	onChange: (stages: StageId[]) => void;
	disabled?: boolean;
}) {
	const [wigglingStageId, setWigglingStageId] = React.useState<StageId | null>(
		null,
	);

	const stages: (StageId | null)[] = [
		...pool,
		...nullFilledArray(amountToPick - pool.length),
	];

	const handlePickedStageClick = (stageId: StageId) => {
		onChange(pool.filter((s) => s !== stageId));
	};

	const handleUnpickedStageClick = (stageId: StageId) => {
		if (stages[amountToPick - 1] !== null) {
			setWigglingStageId(stageId);
			return;
		}

		if (pool.includes(stageId)) {
			return;
		}

		onChange([...pool, stageId].sort((a, b) => a - b));
	};

	return (
		<div className={clsx(styles.container, "stack sm")}>
			<div className="stack sm horizontal justify-center">
				{nullFilledArray(amountToPick).map((_, index) => {
					return (
						<MapSlot
							key={index}
							number={index + 1}
							picked={stages[index] !== null}
						/>
					);
				})}
			</div>
			<Divider className={styles.divider}>
				<ModeImage mode={mode} size={32} />
			</Divider>
			<div className="stack sm horizontal flex-wrap justify-center mt-1">
				{stageIds.map((stageId) => {
					if (!allowedStages.includes(stageId)) return null;
					const selected = stages.includes(stageId);

					const onClick = () => {
						if (disabled) return;
						if (selected) return handlePickedStageClick(stageId);

						handleUnpickedStageClick(stageId);
					};

					return (
						<MapButton
							key={stageId}
							stageId={stageId}
							onClick={onClick}
							selected={selected}
							wiggle={wigglingStageId === stageId}
							onWiggleEnd={() => setWigglingStageId(null)}
							disabled={disabled}
							testId={`map-pool-${mode}-${stageId}`}
						/>
					);
				})}
			</div>
		</div>
	);
}

function MapSlot({ number, picked }: { number: number; picked: boolean }) {
	return (
		<div
			className={clsx(styles.slot, {
				[styles.slotPicked]: picked,
			})}
		>
			{picked ? <Check className={styles.slotIcon} /> : number}
		</div>
	);
}

function MapButton({
	stageId,
	onClick,
	selected,
	wiggle,
	onWiggleEnd,
	disabled,
	testId,
}: {
	stageId: StageId;
	onClick: () => void;
	selected?: boolean;
	wiggle?: boolean;
	onWiggleEnd?: () => void;
	disabled?: boolean;
	testId: string;
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div
			className={clsx("stack items-center relative", styles.mapButtonContainer)}
		>
			<button
				className={clsx(styles.mapButton, {
					[styles.mapButtonWiggle]: wiggle,
					[styles.mapButtonGreyedOut]: selected,
				})}
				style={{ "--map-image-url": `url("${stageImageUrl(stageId)}.avif")` }}
				onClick={onClick}
				onAnimationEnd={wiggle ? onWiggleEnd : undefined}
				disabled={disabled}
				type="button"
				aria-label={t(`game-misc:STAGE_${stageId}`)}
				data-testid={testId}
			/>
			{selected ? (
				<Check
					className={styles.mapButtonIcon}
					onClick={onClick}
					data-testid={`${testId}-picked`}
				/>
			) : null}
			<div className={styles.mapButtonLabel}>
				{shortStageName(t(`game-misc:STAGE_${stageId}`))}
			</div>
		</div>
	);
}
