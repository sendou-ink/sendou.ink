import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import { ModeImage } from "~/components/Image";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { stageIds } from "~/modules/in-game-lists";
import { nullFilledArray } from "~/utils/arrays";
import { stageImageUrl } from "~/utils/urls";
import { BANNED_MAPS } from "../banned-maps";

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
		<div className="map-pool-picker stack sm">
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
			<Divider className="map-pool-picker__divider">
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
			className={clsx("map-pool-picker__slot", {
				"map-pool-picker__slot__picked": picked,
			})}
		>
			{picked ? (
				<CheckmarkIcon className="map-pool-picker__slot__icon" />
			) : (
				number
			)}
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
				className={clsx("map-pool-picker__map-button", {
					"map-pool-picker__map-button__wiggle": wiggle,
					"map-pool-picker__map-button__greyed-out":
						selected || banned || tiebreaker,
				})}
				style={{ "--map-image-url": `url("${stageImageUrl(stageId)}.png")` }}
				onClick={onClick}
				disabled={banned}
				type="button"
				data-testid={testId}
			/>
			{selected ? (
				<CheckmarkIcon
					className="map-pool-picker__map-button__icon"
					onClick={onClick}
				/>
			) : null}
			{tiebreaker ? (
				<div className="map-pool-picker__map-button__text text-info">
					Tiebreak
				</div>
			) : banned ? (
				<div className="map-pool-picker__map-button__text text-error">
					Banned
				</div>
			) : null}
			<div className="map-pool-picker__map-button__label">
				{t(`game-misc:STAGE_${stageId}`)}
			</div>
		</div>
	);
}
