/** Prop derivation for rendering a ScannerMatch's status samples with the shared <PlayerStatusTimeline />. */
import type { PlayerStatusTimelineTeam } from "~/components/PlayerStatusTimeline";
import type { ScannerMatch } from "../core/scanner-match";

/** Row weapons per team from the match's known players, slots by index. */
export function playerStatusTeams(
	match: ScannerMatch,
	labels: readonly [string, string],
): [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam] {
	return [0, 1].map((side) => ({
		label: labels[side]!,
		weapons: [0, 1, 2, 3].map(
			(slot) => match.teams[side as 0 | 1].players[slot]?.weaponId ?? null,
		),
	})) as [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam];
}
