type Verdict = "engine-bug" | "corrupt-data" | "expected-drift";

interface Triage {
	verdict: Verdict;
	why: string;
}

/**
 * What every class of finding turned out to be when the full sandbox run was read through. A class
 * missing from here shows up as untriaged in the report: understand it before adding it.
 */
export const TRIAGE: Record<string, Triage> = {
	"legacy-bracket-reset-filled": {
		verdict: "expected-drift",
		why: "Until October 2024 both grand finalists were put in the bracket reset even when the winners bracket team won the first final. The engine now leaves the reset empty.",
	},
	"legacy-bracket-reset-played": {
		verdict: "corrupt-data",
		why: "Same era: the reset was also reportable, so a set that should not exist has scores. The stored winner is the first final's winner in every case, results are not affected.",
	},
	"legacy-round-robin-layout": {
		verdict: "expected-drift",
		why: "Uneven groups of the brackets-manager era kept their BYE rounds, so the real matches sit in other rounds than the engine creates them in now.",
	},
	"stored:score-differs-from-game-rows": {
		verdict: "corrupt-data",
		why: "Three shapes. Sets ended early in January to April 2026 lost their scores but kept the game rows (ending a set keeps the scores now). Six play all sets from 2024 to January 2026 count a game for the other team than its row says. One swiss set has scores and no rows. Reporting a game is a single transaction now, none is newer than June 2026.",
	},
	"swiss-bye-above-lowest": {
		verdict: "engine-bug",
		why: "The bye went to a team above the lowest score group (tournament 4224 round 3 is one of these). Fixed in August 2026 with the per score point pairing bonus: the current engine gives the bye to a lowest team in every one of these rounds.",
	},
	"swiss-avoidable-rematch": {
		verdict: "expected-drift",
		why: "Rounds paired by an older algorithm with a rematch (or a pair meeting a third time) the current matching avoids.",
	},
	"swiss-repeat-bye": {
		verdict: "expected-drift",
		why: "A second bye to the same team from before prior byes were weighed. The current engine finds a team without one in each of these rounds.",
	},
	"swiss-extra-byes": {
		verdict: "expected-drift",
		why: "Older pairing left rematch pairs unpaired, giving two byes in a round. The matching now always pairs as many teams as possible.",
	},
	"advancement-seeding": {
		verdict: "expected-drift",
		why: "Follow-up bracket seeding (replay avoidance, cross group order) was rewritten in August to October 2026. Same teams, other order. None since the last change to core/Seeding.ts.",
	},
	"advancement-teams": {
		verdict: "expected-drift",
		why: "Older tournaments: brackets started by hand from other placements than the progression now says, progression edited after the fact, check-ins of that era.",
	},
	"standings-shifted-by-drop": {
		verdict: "engine-bug",
		why: "Issue #2869: a team dropping out after it advanced was sorted last in the standings of the bracket it advanced from, moving the teams below it up. Fixed with this harness, so it must stay at zero.",
	},
	"starting-seeding": {
		verdict: "expected-drift",
		why: "Before 2025 seeds were not persisted when the bracket started, so team seeds edited later differ from the order played.",
	},
	"starting-teams": {
		verdict: "expected-drift",
		why: "Two tournaments: a 2023 one with checked in teams that never played, and a test tournament whose teams have no starting bracket stored.",
	},
	"result-placement": {
		verdict: "expected-drift",
		why: "Placement numbering changed several times (underground and consolation brackets, divisions). None since the last change to core/Standings.ts.",
	},
	"result-user-without-stored-row": {
		verdict: "expected-drift",
		why: "Old finalizations (through early 2025) wrote rows for fewer members than the standings have.",
	},
	"result-set-results": {
		verdict: "expected-drift",
		why: "Leagues and one 2023 tournament whose rosters changed after the rows were written.",
	},
	"result-team": {
		verdict: "expected-drift",
		why: "A league player who changed teams after the rows were written.",
	},
	"result-div": {
		verdict: "expected-drift",
		why: "Finalized before results were split by starting bracket.",
	},
	"result-participant-count": {
		verdict: "expected-drift",
		why: "Finalized before results were split by starting bracket.",
	},
};

export const VERDICT_TITLES: Record<Verdict | "untriaged", string> = {
	"engine-bug": "Real bugs",
	"corrupt-data": "Corrupt stored data",
	"expected-drift": "Expected drift",
	untriaged: "Untriaged",
};
