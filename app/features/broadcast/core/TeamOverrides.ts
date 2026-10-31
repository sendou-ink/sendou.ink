import * as R from "remeda";
import type {
	BroadcastOverrides,
	BroadcastPlayer,
	BroadcastPlayerOverride,
	BroadcastTeam,
	BroadcastTeamOverride,
} from "../broadcast-types";

/** The editable values of a team, as the tournament has them or as the producer submitted them. */
export interface TeamValues {
	name: string;
	players: Array<Pick<BroadcastPlayer, "userId" | "name" | "weapons">>;
}

/** The team with the producer's edits applied over the tournament's values. */
export function apply(
	team: BroadcastTeam,
	overrides: BroadcastOverrides,
): BroadcastTeam {
	const teamOverride = overrides.teams[team.id];

	return {
		...team,
		...teamOverride,
		players: team.players.map((player) => ({
			...player,
			...overrides.players[player.userId],
		})),
		isEdited:
			Boolean(teamOverride) ||
			team.players.some((player) => overrides.players[player.userId]),
	};
}

/**
 * Overrides to store for the submitted values: only what differs from the tournament's values, `null` where
 * nothing does (so later changes to the tournament's values show again). Submitted players not on the team are ignored.
 */
export function fromSubmitted({
	defaults,
	submitted,
}: {
	defaults: TeamValues;
	submitted: TeamValues;
}): {
	team: BroadcastTeamOverride | null;
	players: Array<{ userId: number; override: BroadcastPlayerOverride | null }>;
} {
	return {
		team: submitted.name !== defaults.name ? { name: submitted.name } : null,
		players: defaults.players.map((player) => {
			const submittedPlayer = submitted.players.find(
				(candidate) => candidate.userId === player.userId,
			);
			const override: BroadcastPlayerOverride = {};
			if (submittedPlayer && submittedPlayer.name !== player.name) {
				override.name = submittedPlayer.name;
			}
			if (
				submittedPlayer &&
				!R.isDeepEqual(submittedPlayer.weapons, player.weapons)
			) {
				override.weapons = submittedPlayer.weapons;
			}

			return {
				userId: player.userId,
				override: R.isEmpty(override) ? null : override,
			};
		}),
	};
}
