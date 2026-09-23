import { add } from "date-fns";
import * as v from "valibot";
import { array, datetime, stringConstant } from "~/form/fields";
import { _action, id } from "~/utils/schema";
import { LEAGUE_SCHEDULING } from "./core/LeagueScheduling";

const CANDIDATE_MAX_DAYS_AHEAD = 60;

const leagueTimeField = (label: "labels.candidateTime" | "labels.setTime") =>
	datetime({
		label,
		min: () => new Date(),
		max: () => add(new Date(), { days: CANDIDATE_MAX_DAYS_AHEAD }),
		minMessage: "errors.dateInPast",
	});

/** A team's full set of candidate times for its league set, replacing what it had up. */
export const proposeLeagueTimesSchema = v.object({
	_action: stringConstant("PROPOSE_TIMES"),
	times: array({
		bottomText: "bottomTexts.candidateTimes",
		max: LEAGUE_SCHEDULING.MAX_OPEN_PROPOSALS_PER_TEAM,
		field: leagueTimeField("labels.candidateTime"),
	}),
});

/** The organizer's final say on when the set is played. */
export const organizerSetLeagueTimeSchema = v.object({
	_action: stringConstant("ORGANIZER_SET_TIME"),
	scheduledAt: leagueTimeField("labels.setTime"),
});

export const leagueScheduleSchemas = [
	proposeLeagueTimesSchema,
	organizerSetLeagueTimeSchema,
	v.object({
		_action: _action("ACCEPT_PROPOSAL"),
		proposalId: id,
	}),
	v.object({
		_action: _action("REJECT_RESCHEDULE"),
	}),
] as const;
