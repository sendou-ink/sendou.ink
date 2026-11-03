import * as R from "remeda";
import {
	FEED_SCRIM_FIT_MAX_DIV_GAP,
	FEED_SCRIM_USUAL_OPPONENT_MIN_SCRIMS,
} from "../feed-constants";

const HOUR = 3600;

/** Why a scrim post is shown, most relevant first */
export const SCRIM_POST_REASONS = [
	"REQUESTED",
	"USUAL_OPPONENT",
	"ASSOCIATION",
	"FIT",
] as const;

export type ScrimPostReason = (typeof SCRIM_POST_REASONS)[number];

export interface ScrimTeamProfile {
	/** Teams scrimmed at least `FEED_SCRIM_USUAL_OPPONENT_MIN_SCRIMS` times */
	usualOpponentIds: Set<number>;
	/** UTC hours of the day the team's scrims have started at */
	hours: Set<number>;
	/** Median serialized LUTI div of the members (X is 0), `null` when none has one */
	div: number | null;
}

export interface ScrimPostCandidate {
	teamId: number;
	/** UTC hours of the day the scrim can start at, see `startHours` */
	hours: number[];
	/** Highest div accepted, serialized */
	maxDiv: number | null;
	/** Lowest div accepted, serialized */
	minDiv: number | null;
	hasRequested: boolean;
	isViaAssociation: boolean;
}

/** The scrimming profile of a team from its accepted scrims and its members' serialized LUTI divs. */
export function teamProfile({
	scrims,
	memberDivs,
}: {
	scrims: Array<{ opponentTeamId: number | null; startsAt: number }>;
	memberDivs: number[];
}): ScrimTeamProfile {
	const scrimCountByOpponent = R.countBy(
		scrims.filter((scrim) => scrim.opponentTeamId !== null),
		(scrim) => String(scrim.opponentTeamId),
	);

	return {
		usualOpponentIds: new Set(
			Object.entries(scrimCountByOpponent)
				.filter(([, count]) => count >= FEED_SCRIM_USUAL_OPPONENT_MIN_SCRIMS)
				.map(([teamId]) => Number(teamId)),
		),
		hours: new Set(scrims.map((scrim) => utcHourOf(scrim.startsAt))),
		div: R.median(memberDivs) ?? null,
	};
}

/** UTC hours of the day a post starting at `startsAt` (and flexible until `rangeEndsAt`) can start at. */
export function startHours({
	startsAt,
	rangeEndsAt,
}: {
	startsAt: number;
	rangeEndsAt: number | null;
}) {
	const hours = [utcHourOf(startsAt)];
	for (let at = startsAt + HOUR; at <= (rangeEndsAt ?? startsAt); at += HOUR) {
		hours.push(utcHourOf(at));
	}

	return R.unique(hours);
}

/**
 * Why a scrim post is shown to a member of teams with the profiles, `null` when it isn't. Fit needs
 * a usual scrim hour and a div within `FEED_SCRIM_FIT_MAX_DIV_GAP` of the post's range.
 */
export function reasonOf(
	profiles: ScrimTeamProfile[],
	post: ScrimPostCandidate,
): ScrimPostReason | null {
	if (profiles.length === 0) return null;
	if (post.hasRequested) return "REQUESTED";
	if (profiles.some((profile) => profile.usualOpponentIds.has(post.teamId))) {
		return "USUAL_OPPONENT";
	}
	if (post.isViaAssociation) return "ASSOCIATION";
	if (profiles.some((profile) => fits(profile, post))) return "FIT";

	return null;
}

function fits(profile: ScrimTeamProfile, post: ScrimPostCandidate) {
	if (!post.hours.some((hour) => profile.hours.has(hour))) return false;
	if (post.maxDiv === null && post.minDiv === null) return true;
	if (profile.div === null) return false;

	return (
		profile.div >= (post.maxDiv ?? 0) - FEED_SCRIM_FIT_MAX_DIV_GAP &&
		profile.div <=
			(post.minDiv ?? Number.POSITIVE_INFINITY) + FEED_SCRIM_FIT_MAX_DIV_GAP
	);
}

function utcHourOf(timestamp: number) {
	return new Date(timestamp * 1000).getUTCHours();
}
