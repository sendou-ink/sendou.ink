import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { ModeMapPoolPicker } from "~/features/settings/components/ModeMapPoolPicker";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { TOURNAMENT } from "../tournament-constants";
import { useTournament } from "../tournament-context";
import {
	type CounterPickValidationStatus,
	isOneModeTournamentOf,
	validateCounterPickMapPool,
} from "../tournament-utils";

export type CounterPickMapPool = Array<{
	mode: ModeShort;
	stageId: StageId;
}>;

/** Picker for the counterpick maps of a team, one picker per mode the tournament is played on. */
export function CounterPickMapPoolPicker({
	mapPool,
	onChange,
	disabled,
}: {
	mapPool: CounterPickMapPool;
	onChange: (mapPool: CounterPickMapPool) => void;
	disabled?: boolean;
}) {
	const tournament = useTournament();
	const oneModeOnlyFor = oneModeTournamentOf(tournament);

	return (
		<>
			{tournament.modesIncluded.map((mode) => (
				<ModeMapPoolPicker
					key={mode}
					amountToPick={
						oneModeOnlyFor
							? TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
							: TOURNAMENT.COUNTERPICK_MAPS_PER_MODE
					}
					mode={mode}
					tiebreaker={
						tournament.ctx.tieBreakerMapPool.find(
							(stage) => stage.mode === mode,
						)?.stageId
					}
					pool={mapPool
						.filter((map) => map.mode === mode)
						.map((map) => map.stageId)}
					onChange={(stageIds) =>
						onChange([
							...mapPool.filter((map) => map.mode !== mode),
							...stageIds.map((stageId) => ({ mode, stageId })),
						])
					}
					disabled={disabled}
				/>
			))}
		</>
	);
}

/** Validates a counterpick map pool against the tournament being viewed. */
export function useCounterPickMapPoolValidationStatus(
	mapPool: CounterPickMapPool,
) {
	const tournament = useTournament();

	return validateCounterPickMapPool(
		new MapPool(mapPool),
		oneModeTournamentOf(tournament),
		tournament.ctx.tieBreakerMapPool,
	);
}

/** Explains why a counterpick map pool can't be saved. Renders nothing for statuses without an explanation. */
export function MapPoolValidationStatusMessage({
	status,
}: {
	status: CounterPickValidationStatus;
}) {
	const { t } = useTranslation(["common"]);

	if (
		status !== "TOO_MUCH_STAGE_REPEAT" &&
		status !== "STAGE_REPEAT_IN_SAME_MODE" &&
		status !== "INCLUDES_BANNED" &&
		status !== "INCLUDES_TIEBREAKER"
	) {
		return null;
	}

	return (
		<div className="mt-4">
			<Alert alertClassName="w-max" variation="WARNING" tiny>
				{t(`common:maps.validation.${status}`, {
					maxStageRepeat: TOURNAMENT.COUNTERPICK_MAX_STAGE_REPEAT,
				})}
			</Alert>
		</div>
	);
}

function oneModeTournamentOf(tournament: Tournament): ModeShort | null {
	return isOneModeTournamentOf(
		tournament.ctx.mapPickingStyle,
		tournament.ctx.toSetMapPool,
	);
}
