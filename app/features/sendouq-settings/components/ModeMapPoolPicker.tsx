import clsx from "clsx";
import { Check } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import { ModeImage } from "~/components/Image";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { nullFilledArray } from "~/utils/arrays";
import { stageImageUrl } from "~/utils/urls";
import { BANNED_MAPS } from "../banned-maps";
import styles from "./ModeMapPoolPicker.module.css";

export function ModeMapPoolPicker({
	mode,
	amountToPick,
	pool,
	tiebreaker,
	onChange,
}: {
	mode: ModeShort;
	amountToPick: number;
	pool: StageId[];
	tiebreaker?: StageId;
	onChange: (stages: StageId[]) => void;
}) {
	const [wigglingStageId, setWigglingStageId] = React.useState<StageId | null>(
		null,
	);

	React.useEffect(() => {
		if (wigglingStageId === null) return;
		const timeout = setTimeout(() => {
			setWigglingStageId(null);
		}, 1000);

		return () => {
			clearTimeout(timeout);
		};
	}, [wigglingStageId]);

	const stages: (StageId | null)[] = [
		...pool,
		...nullFilledArray(amountToPick - pool.length),
	];

	const handlePickedStageClick = (stageId: StageId) => {
		onChange(pool.filter((s) => s !== stageId));
	};

	const handleUnpickedStageClick = (stageId: StageId) => {
		// is there space left?
		if (stages[amountToPick - 1] !== null) {
			setWigglingStageId(stageId);
			return;
		}

		// was it already picked?
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
					const isTiebreaker = tiebreaker === stageId;
					const banned = BANNED_MAPS[mode].includes(stageId);
					const selected = stages.includes(stageId);

					const onClick = () => {
						if (isTiebreaker) return;
						if (banned) return;
						if (selected) return handlePickedStageClick(stageId);

						handleUnpickedStageClick(stageId);
					};

					return (
						<MapButton
							key={stageId}
							stageId={stageId}
							onClick={onClick}
							selected={selected}
							banned={banned}
							tiebreaker={isTiebreaker}
							wiggle={wigglingStageId === stageId}
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
	banned,
	tiebreaker,
	wiggle,
	testId,
}: {
	stageId: StageId;
	onClick: () => void;
	selected?: boolean;
	banned?: boolean;
	tiebreaker?: boolean;
	wiggle?: boolean;
	testId: string;
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className="stack items-center relative">
			<button
				className={clsx(styles.mapButton, {
					[styles.mapButtonWiggle]: wiggle,
					[styles.mapButtonGreyedOut]: selected || banned || tiebreaker,
				})}
				style={{ "--map-image-url": `url("${stageImageUrl(stageId)}.png")` }}
				onClick={onClick}
				disabled={banned}
				type="button"
				data-testid={testId}
			/>
			{selected ? (
				<Check className={styles.mapButtonIcon} onClick={onClick} />
			) : null}
			{tiebreaker ? (
				<div className={clsx(styles.mapButtonText, "text-info")}>Tiebreak</div>
			) : banned ? (
				<div className={clsx(styles.mapButtonText, "text-error")}>Banned</div>
			) : null}
			<div className={styles.mapButtonLabel}>
				{t(`game-misc:STAGE_${stageId}`)}
			</div>
		</div>
	);
}
