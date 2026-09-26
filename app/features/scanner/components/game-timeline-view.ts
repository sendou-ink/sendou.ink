/** Prop derivation for rendering a ScannerMatch with the shared <GameTimeline />. */
import type { ComponentProps } from "react";
import type { GameTimeline } from "~/components/GameTimeline";
import type { PlayerStatusTimelineTeam } from "~/components/PlayerStatusTimeline";
import type { ScannerMatch, ScannerMatchPlayer } from "../core/scanner-match";
import { rankBy } from "../core/text";

/**
 * A kill-feed name pins its kill on the enemy row it reads exactly (after
 * matchKey), else on the row it resembles clearly more than any other: OCR of
 * the feed's font garbles symbols the scoreboard reads fine, so a loose best
 * match stands when the other names are far off.
 */
const VICTIM_NAME_MIN_SIMILARITY = 0.4;
const VICTIM_NAME_MIN_MARGIN = 0.25;

const PLAYER_SLOTS = [0, 1, 2, 3] as const;

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
				control: ordered(sample.control),
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

function victimSlot(
	name: string | null,
	enemies: readonly ScannerMatchPlayer[],
): number | null {
	if (name === null) return null;
	const named = enemies.flatMap((player, slot) =>
		player.name !== null ? [{ slot, name: player.name }] : [],
	);
	const [best, runnerUp] = rankBy(name, named, (enemy) => enemy.name);
	if (!best || best.score < VICTIM_NAME_MIN_SIMILARITY) return null;
	if (best.score === 1 && runnerUp?.score !== 1) return best.entry.slot;
	if (runnerUp && best.score - runnerUp.score < VICTIM_NAME_MIN_MARGIN) {
		return null;
	}
	return best.entry.slot;
}
