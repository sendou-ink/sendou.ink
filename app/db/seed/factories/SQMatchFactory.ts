import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";

type Options = {
	/** Play the match out, alpha winning every map, up to both teams having agreed
	 * on the score. Leaves both groups inactive, as a real concluded match does. */
	isConcluded: boolean;
};

/** Creates SendouQ matches. Both groups have to be full, as they are when the
 * matchmaking UI creates a match. */
export const { create, createMany } = defineFactory({
	defaults: () => ({
		mapList: SplatoonFaker.mapList(SENDOUQ_BEST_OF).map((map) => ({
			...map,
			source: "BOTH" as const,
		})),
		memento: { users: {}, groups: {}, pools: [] },
	}),
	insert: SQMatchRepository.insert,
	applyOptions: async (match, { isConcluded }: Options) => {
		if (!isConcluded) return;

		await playOutMatch(match.id);
	},
});

async function playOutMatch(matchId: number) {
	const match = await SQMatchRepository.findById(matchId);
	invariant(match, "Match not found");

	const winnerId = match.groupAlpha.id;
	const reportedByUserId = match.groupAlpha.members[0].id;
	const confirmedByUserId = match.groupBravo.members[0].id;

	let reportedCount = 0;
	let result = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId,
		reportedCount,
	});

	while (result.status === "MAP_REPORTED") {
		reportedCount++;
		result = await SQMatchRepository.reportMapWinner({
			matchId,
			winnerId,
			reportedByUserId,
			reportedCount,
		});
	}

	invariant(
		result.status === "MATCH_REPORTED",
		`Reporting the deciding map resulted in ${result.status}`,
	);

	const confirmation = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId: confirmedByUserId,
		reportedCount: reportedCount + 1,
	});

	invariant(
		confirmation.status === "MATCH_FINALIZED",
		`Confirming the score resulted in ${confirmation.status}`,
	);
}
