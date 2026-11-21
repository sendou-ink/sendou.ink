/** Prop derivation for rendering a ScannerMatch with the shared <GameTimeline />. */

import type { ComponentProps } from "react";
import * as R from "remeda";
import type { GameTimeline } from "~/components/GameTimeline";
import type {
	PlayerStatusTimelineKiller,
	PlayerStatusTimelineTeam,
} from "~/components/PlayerStatusTimeline";
import {
	killerSeat,
	type ScannerMatch,
	type ScannerMatchSeat,
	swapObjectiveSampleSides,
	swapPlayerStatusSampleSides,
	victimSlot,
} from "../core/scanner-match";

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
 * in display order (the POV's team first), `t` shifted to `origin`. The kill
 * feed's kills go on their killer's row (the POV seat's, or on a cast the
 * row of whoever the camera was on at the kill), each pinned to its victim's
 * row by name; a cast kill no read placed the camera for belongs to no row.
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
		objectiveEvents: (match.objective?.samples ?? []).map((sample) => {
			const { t, ...data } =
				first === 1 ? swapObjectiveSampleSides(sample) : sample;
			return { t: t - origin, data };
		}),
		playerStatusSamples: (match.playerStatus?.samples ?? []).map((sample) => {
			const { t, special, dead } =
				first === 1 ? swapPlayerStatusSampleSides(sample) : sample;
			return { t: t - origin, special, dead };
		}),
		teams: ordered(match.teams).map(
			(team, side): PlayerStatusTimelineTeam => ({
				label: labels[side]!,
				weapons: PLAYER_SLOTS.map(
					(slot) => team.players[slot]?.weaponId ?? null,
				),
			}),
		) as [PlayerStatusTimelineTeam, PlayerStatusTimelineTeam],
		killers: killersOf(match, origin, [first, second]),
	};
}

function killersOf(
	match: ScannerMatch,
	origin: number,
	order: readonly [0 | 1, 0 | 1],
): PlayerStatusTimelineKiller[] {
	const credited = (match.kills ?? []).flatMap((kill) => {
		const seat = killerSeat(match, kill);
		return seat ? [{ seat, kill }] : [];
	});
	const seatKey = (seat: ScannerMatchSeat) => `${seat.team}.${seat.index}`;
	const seats = R.uniqueBy(
		[...(match.pov ? [match.pov] : []), ...credited.map(({ seat }) => seat)],
		seatKey,
	);
	return seats.map((seat) => ({
		side: order.indexOf(seat.team) as 0 | 1,
		slot: seat.index,
		pov: match.pov !== null,
		kills: credited
			.filter((credit) => seatKey(credit.seat) === seatKey(seat))
			.map(({ kill }) => ({
				t: kill.t - origin,
				name: kill.name,
				victimSlot: victimSlot(
					kill.name,
					match.teams[seat.team === 0 ? 1 : 0].players,
				),
			})),
	}));
}
