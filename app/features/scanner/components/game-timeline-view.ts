/** Prop derivation for rendering a ScannerMatch with the shared <GameTimeline />. */
import type { ComponentProps } from "react";
import type { GameTimeline } from "~/components/GameTimeline";
import type { PlayerStatusTimelineTeam } from "~/components/PlayerStatusTimeline";
import { type ScannerMatch, victimSlot } from "../core/scanner-match";

const PLAYER_SLOTS = [0, 1, 2, 3] as const;

/** The scan knows the on-screen sides only, not who is playing: left, right. */
export const TEAM_LABELS = ["Alpha", "Bravo"] as const;

/**
 * `teams` order is winner-first on a scoreboard-closed match, so it flips
 * between games. The card keeps the scan's own side left and the enemy right
 * for every match so consecutive games line up; footage with no POV seat
 * read (casts) keeps `teams` order.
 */
export function displayOrder(match: ScannerMatch): [0 | 1, 0 | 1] {
	return match.pov?.team === 1 ? [1, 0] : [0, 1];
}

/**
 * Live sessions stamp reads with wall-clock seconds and VoDs with file position;
 * the timeline charts want seconds since the match began either way.
 */
export function timelineOrigin(match: ScannerMatch): number {
	return (
		match.startsAt ??
		match.objective?.samples[0]?.t ??
		match.playerStatus?.samples[0]?.t ??
		0
	);
}

/**
 * The match's counter and icon-strip reads as <GameTimeline /> props: sides
 * in display order (the POV's team first), `t` shifted to `origin`. With the
 * POV seat known, its row carries the kill feed's kills, each pinned to its
 * victim's row by name. A cast has no seat: its feed follows the camera, so
 * the kills belong to no single row.
 */
export function gameTimelineProps(
	match: ScannerMatch,
	origin: number,
	labels: readonly [string, string],
): ComponentProps<typeof GameTimeline> {
	const [first, second] = displayOrder(match);
	const ordered = <T>(pair: readonly [T, T]): [T, T] => [
		pair[first],
		pair[second],
	];

	return {
		objectiveEvents: (match.objective?.samples ?? []).map((sample) => ({
			t: sample.t - origin,
			data: {
				time: sample.time,
				score: ordered(sample.score),
				penalty: ordered(sample.penalty),
				control:
					sample.control === null ? null : sample.control === first ? 0 : 1,
				position:
					first === 1 && sample.position != null
						? 0 - sample.position
						: sample.position,
			},
		})),
		playerStatusSamples: (match.playerStatus?.samples ?? []).map((sample) => ({
			t: sample.t - origin,
			special: ordered(sample.special),
			dead: ordered(sample.dead),
		})),
		teams: ordered(match.teams).map(
			(team, side): PlayerStatusTimelineTeam => ({
				label: labels[side]!,
				weapons: PLAYER_SLOTS.map(
					(slot) => team.players[slot]?.weaponId ?? null,
				),
			}),
		) as [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam],
		pov: match.pov
			? {
					side: 0,
					slot: match.pov.index,
					kills: (match.kills ?? []).map((kill) => ({
						t: kill.t - origin,
						name: kill.name,
						victimSlot: victimSlot(kill.name, match.teams[second].players),
					})),
				}
			: undefined,
	};
}
