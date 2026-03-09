import { assertUnreachable } from "~/utils/types";
import type { CreateBracketArgs } from "./Bracket";
import { DoubleEliminationBracket } from "./DoubleEliminationBracket";
import { RoundRobinBracket } from "./RoundRobinBracket";
import { SingleEliminationBracket } from "./SingleEliminationBracket";
import { SwissBracket } from "./SwissBracket";

export type { CreateBracketArgs, Standing, TeamTrackRecord } from "./Bracket";
export { Bracket } from "./Bracket";

export function createBracket(
	args: CreateBracketArgs,
): SingleEliminationBracket | DoubleEliminationBracket | RoundRobinBracket {
	switch (args.type) {
		case "single_elimination": {
			return new SingleEliminationBracket(args);
		}
		case "double_elimination": {
			return new DoubleEliminationBracket(args);
		}
		case "round_robin": {
			return new RoundRobinBracket(args);
		}
		case "swiss": {
			return new SwissBracket(args);
		}
		default: {
			assertUnreachable(args.type);
		}
	}
}
