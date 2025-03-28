import type { LoaderFunctionArgs } from "@remix-run/node";
import type { UserWithPlusTier } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { lastCompletedVoting } from "~/features/plus-voting/core";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const results = await PlusVotingRepository.resultsByMonthYear(
		lastCompletedVoting(new Date()),
	);

	return {
		results: censorScores(results),
		ownScores: ownScores({ results, user }),
		lastCompletedVoting: lastCompletedVoting(new Date()),
	};
};

function censorScores(results: PlusVotingRepository.ResultsByMonthYearItem[]) {
	return results.map((tier) => ({
		...tier,
		passed: tier.passed.map((result) => ({
			...result,
			score: undefined,
		})),
		failed: tier.failed.map((result) => ({
			...result,
			score: undefined,
		})),
	}));
}

function ownScores({
	results,
	user,
}: {
	results: PlusVotingRepository.ResultsByMonthYearItem[];
	user?: Pick<UserWithPlusTier, "id" | "patronTier">;
}) {
	return results
		.flatMap((tier) => [...tier.failed, ...tier.passed])
		.filter((result) => {
			return result.id === user?.id;
		})
		.map((result) => {
			const showScore =
				(result.wasSuggested && !result.passedVoting) ||
				isAtLeastFiveDollarTierPatreon(user);

			const resultsOfOwnTierExcludingOwn = () => {
				const ownTierResults = results.find(
					(tier) => tier.tier === result.tier,
				);
				invariant(ownTierResults, "own tier results not found");

				return [...ownTierResults.failed, ...ownTierResults.passed].filter(
					(otherResult) => otherResult.id !== result.id,
				);
			};

			const mappedResult: {
				tier: number;
				score?: number;
				passedVoting: number;
				betterThan?: number;
			} = {
				tier: result.tier,
				score: databaseAvgToPercentage(result.score),
				passedVoting: result.passedVoting,
				betterThan: roundToNDecimalPlaces(
					(resultsOfOwnTierExcludingOwn().filter(
						(otherResult) => otherResult.score <= result.score,
					).length /
						resultsOfOwnTierExcludingOwn().length) *
						100,
				),
			};

			if (!showScore) mappedResult.score = undefined;
			if (!isAtLeastFiveDollarTierPatreon(user) || !result.passedVoting) {
				mappedResult.betterThan = undefined;
			}

			return mappedResult;
		});
}

function databaseAvgToPercentage(score: number) {
	const scoreNormalized = score + 1;

	return roundToNDecimalPlaces((scoreNormalized / 2) * 100);
}
