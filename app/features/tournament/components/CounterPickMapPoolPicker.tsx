import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { ModeMapPoolPicker } from "~/features/settings/components/ModeMapPoolPicker";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { invariant } from "~/utils/invariant";
import * as TeamPick from "../core/TeamPick";
import { useTournament } from "../tournament-context";

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
	const teamPick = tournament.teamPickSettings;
	invariant(teamPick, "Tournament does not have teams pick maps");

	const pool = tournament.mapPool;

	return (
		<>
			{teamPick.modes.map(({ mode, count }) => (
				<ModeMapPoolPicker
					key={mode}
					amountToPick={count}
					mode={mode}
					allowedStages={pool.parsed[mode]}
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
	const teamPick = tournament.teamPickSettings;
	invariant(teamPick, "Tournament does not have teams pick maps");

	return TeamPick.validateTeamPool({
		mapPool: new MapPool(mapPool),
		teamPick,
		pool: tournament.mapPool,
	});
}

/** Explains why a counterpick map pool can't be saved. Renders nothing for statuses without an explanation. */
export function MapPoolValidationStatusMessage({
	status,
}: {
	status: TeamPick.TeamPoolValidationStatus;
}) {
	const { t } = useTranslation(["common"]);
	const tournament = useTournament();

	if (
		status !== "TOO_MUCH_STAGE_REPEAT" &&
		status !== "STAGE_REPEAT_IN_SAME_MODE" &&
		status !== "NOT_IN_POOL"
	) {
		return null;
	}

	return (
		<div className="mt-4">
			<Alert alertClassName="w-max" variation="WARNING" tiny>
				{t(`common:maps.validation.${status}`, {
					maxStageRepeat: tournament.stageRepeatCap ?? 1,
				})}
			</Alert>
		</div>
	);
}
