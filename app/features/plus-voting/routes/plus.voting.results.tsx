import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import type { UserWithPlusTier } from "~/db/types";
import { getUser } from "~/features/auth/core/user.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { lastCompletedVoting } from "~/features/plus-voting/core";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { PLUS_SERVER_DISCORD_URL, userPage } from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";

import "~/styles/plus-history.css";
import { metaTags } from "~/utils/remix";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Plus Server voting results",
		ogTitle: "Plus Server voting results",
		description:
			"Plus Server (+1, +2 and +3) voting results for the latest season.",
		location: args.location,
	});
};

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

function databaseAvgToPercentage(score: number) {
	const scoreNormalized = score + 1;

	return roundToNDecimalPlaces((scoreNormalized / 2) * 100);
}

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

export default function PlusVotingResultsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			<h2 className="text-center">
				Voting results for {data.lastCompletedVoting.month + 1}/
				{data.lastCompletedVoting.year}
			</h2>
			{data.ownScores && data.ownScores.length > 0 ? (
				<>
					<ul className="plus-history__own-scores stack sm">
						{data.ownScores.map((result) => (
							<li key={result.tier}>
								You{" "}
								{result.passedVoting ? (
									<span className="plus-history__success">passed</span>
								) : (
									<span className="plus-history__fail">didn&apos;t pass</span>
								)}{" "}
								the +{result.tier} voting
								{typeof result.score === "number"
									? `, your score was ${result.score}% ${
											result.betterThan
												? `(better than ${result.betterThan}% others)`
												: "(at least 60% required to pass)"
										}`
									: ""}
							</li>
						))}
					</ul>
					<div className="text-sm text-center text-lighter">
						Click{" "}
						<a href={PLUS_SERVER_DISCORD_URL} target="_blank" rel="noreferrer">
							here
						</a>{" "}
						to join the Discord server. In some cases you might need to rejoin
						the server to get the correct role.
					</div>
				</>
			) : null}
			{!data.ownScores ? (
				<div className="text-center text-sm">
					You weren&apos;t in the voting this month.
				</div>
			) : null}
			{data.results ? <Results results={data.results} /> : null}
		</div>
	);
}

function Results({
	results,
}: {
	results: NonNullable<SerializeFrom<typeof loader>["results"]>;
}) {
	return (
		<div>
			<div className="text-xs text-lighter">S = Suggested user</div>
			<div className="stack lg">
				{results.map((tiersResults) => (
					<div className="stack md" key={tiersResults.tier}>
						<h3 className="plus-history__tier-header">
							<span>+{tiersResults.tier}</span>
						</h3>
						{(["passed", "failed"] as const).map((status) => (
							<div key={status} className="plus-history__passed-info-container">
								<h4 className="plus-history__passed-header">
									{status === "passed" ? "Passed" : "Didn't pass"} (
									{tiersResults[status].length})
								</h4>
								{tiersResults[status].map((user) => (
									<Link
										to={userPage(user)}
										className={clsx("plus-history__user-status", {
											failed: status === "failed",
										})}
										key={user.id}
									>
										{user.wasSuggested ? (
											<span className="plus-history__suggestion-s">S</span>
										) : null}
										{user.username}
									</Link>
								))}
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
