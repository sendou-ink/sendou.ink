import { differenceInDays } from "date-fns";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { useSpoilerFree } from "~/hooks/useSpoilerFree";

export type SpoilerCensor = "full" | "score-only" | undefined;

export function useBracketSpoilerCensor() {
	const tournament = useTournament();
	const { isEnabled, isCensored, reveal, hide } = useSpoilerFree();

	const withinSpoilerWindow =
		tournament.ctx.isFinalized &&
		differenceInDays(new Date(), tournament.ctx.startTime) <
			TOURNAMENT.VOD_VISIBILITY_DAYS;

	const censored = withinSpoilerWindow && isCensored(tournament.ctx.id);

	const canToggle = isEnabled && withinSpoilerWindow;

	return {
		censored,
		canToggle,
		matchCensorLevel: (
			args: Omit<MatchCensorLevelArgs, "censored">,
		): SpoilerCensor =>
			matchCensorLevel({ ...args, censored: Boolean(censored) }),
		reveal: () => reveal(tournament.ctx.id),
		hide: () => hide(tournament.ctx.id),
	};
}

interface MatchCensorLevelArgs {
	censored: boolean;
	bracketType:
		| "double_elimination"
		| "single_elimination"
		| "swiss"
		| "round_robin";
	roundName?: string;
	roundNumber: number;
	roundIdx: number;
	matchType?: "winners" | "losers" | "grands" | "groups";
}

export function matchCensorLevel(args: MatchCensorLevelArgs): SpoilerCensor {
	if (!args.censored) return undefined;

	if (args.roundName === TOURNAMENT.ROUND_NAMES.BRACKET_RESET) {
		return "full";
	}

	if (
		args.bracketType === "double_elimination" ||
		args.bracketType === "single_elimination"
	) {
		if (args.matchType === "winners" && args.roundIdx === 0) {
			return "score-only";
		}
		return "full";
	}

	if (args.bracketType === "swiss") {
		if (args.roundNumber === 1) return "score-only";
		return "full";
	}

	if (args.bracketType === "round_robin") {
		return "score-only";
	}

	return "full";
}
