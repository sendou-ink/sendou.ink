/**
 * Prop derivation for rendering a ScannerMatch's status samples with the
 * shared <PlayerStatusTimeline />, used by the Live and VoD tabs.
 */
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

/** The objective chart's x-range, so both timelines share one axis. */
export function objectiveDomain(
	events: readonly { t: number }[],
): [number, number] | undefined {
	if (events.length === 0) return undefined;
	return [events[0]!.t, events[events.length - 1]!.t];
}
