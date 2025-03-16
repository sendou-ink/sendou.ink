import type {
	ActionFunction,
	LoaderFunction,
	MetaFunction,
} from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { formatDistance } from "date-fns";
import * as React from "react";
import { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { RelativeTime } from "~/components/RelativeTime";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { PLUS_DOWNVOTE, PLUS_UPVOTE } from "~/constants";
import { getUser, requireUser } from "~/features/auth/core/user.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import type { PlusVoteFromFE } from "~/features/plus-voting/core";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
	usePlusVoting,
} from "~/features/plus-voting/core";
import { isVotingActive } from "~/features/plus-voting/core/voting-time";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import { badRequestIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertType, assertUnreachable } from "~/utils/types";
import { safeJSONParse } from "~/utils/zod";
import { PlusSuggestionComments } from "../../plus-suggestions/routes/plus.suggestions";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Plus Server Voting",
		location: args.location,
	});
};

const voteSchema = z.object({
	votedId: z.number(),
	score: z.number().refine((val) => [PLUS_DOWNVOTE, PLUS_UPVOTE].includes(val)),
});

assertType<z.infer<typeof voteSchema>, PlusVoteFromFE>();

const votingActionSchema = z.object({
	votes: z.preprocess(safeJSONParse, z.array(voteSchema)),
});

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: votingActionSchema,
	});

	if (!isVotingActive()) {
		throw new Response(null, { status: 400 });
	}

	invariant(user.plusTier, "User should have plusTier");

	const usersForVoting = await PlusVotingRepository.usersForVoting({
		id: user.id,
		plusTier: user.plusTier,
	});

	// this should not be needed but makes the voting a bit more resilient
	// if there is a bug that causes some user to show up twice, or some user to show up who should not be included
	const seen = new Set<number>();
	const filteredVotes = data.votes.filter((vote) => {
		if (seen.has(vote.votedId)) {
			return false;
		}
		seen.add(vote.votedId);
		return usersForVoting.some((u) => u.user.id === vote.votedId);
	});

	validateVotes({ votes: filteredVotes, usersForVoting });

	// freebie +1 for yourself if you vote
	const votesForDb = [...filteredVotes].concat({
		votedId: user.id,
		score: PLUS_UPVOTE,
	});

	const votingRange = badRequestIfFalsy(nextNonCompletedVoting(new Date()));
	const { month, year } = rangeToMonthYear(votingRange);
	await PlusVotingRepository.upsertMany(
		votesForDb.map((vote) => ({
			...vote,
			authorId: user.id,
			month,
			year,
			tier: user.plusTier!, // no clue why i couldn't make narrowing the type down above work
			validAfter: dateToDatabaseTimestamp(votingRange.endDate),
		})),
	);

	return null;
};

function validateVotes({
	votes,
	usersForVoting,
}: {
	votes: PlusVoteFromFE[];
	usersForVoting?: PlusVotingRepository.UsersForVoting;
}) {
	if (!usersForVoting) throw new Response(null, { status: 400 });

	// converting it to set also handles the check for duplicate ids
	const votedUserIds = new Set(votes.map((v) => v.votedId));

	if (votedUserIds.size !== usersForVoting.length) {
		throw new Response(null, { status: 400 });
	}

	for (const { user } of usersForVoting) {
		if (!votedUserIds.has(user.id)) {
			throw new Response(null, { status: 400 });
		}
	}
}

type PlusVotingLoaderData =
	// next voting date is not in the system
	| {
			type: "noTimeDefinedInfo";
	  }
	// voting is not active OR user is not eligible to vote
	| {
			type: "timeInfo";
			voted?: boolean;
			timeInfo: {
				timestamp: number;
				timing: "starts" | "ends";
				relativeTime: string;
			};
	  }
	// user can vote
	| {
			type: "voting";
			usersForVoting: PlusVotingRepository.UsersForVoting;
			votingEnds: {
				timestamp: number;
				relativeTime: string;
			};
	  };

export const loader: LoaderFunction = async ({ request }) => {
	const user = await getUser(request);

	const now = new Date();
	const nextVotingRange = nextNonCompletedVoting(now);

	if (!nextVotingRange) {
		return { type: "noTimeDefinedInfo" };
	}

	if (!isVotingActive()) {
		return {
			type: "timeInfo",
			timeInfo: {
				relativeTime: formatDistance(nextVotingRange.startDate, now, {
					addSuffix: true,
				}),
				timestamp: nextVotingRange.startDate.getTime(),
				timing: "starts",
			},
		};
	}

	const usersForVoting = user?.plusTier
		? await PlusVotingRepository.usersForVoting({
				id: user.id,
				plusTier: user.plusTier,
			})
		: undefined;
	const hasVoted = user
		? await PlusVotingRepository.hasVoted({
				authorId: user.id,
				...rangeToMonthYear(nextVotingRange),
			})
		: false;

	if (!usersForVoting || hasVoted) {
		return {
			type: "timeInfo",
			voted: hasVoted,
			timeInfo: {
				relativeTime: formatDistance(nextVotingRange.endDate, now, {
					addSuffix: true,
				}),
				timestamp: nextVotingRange.endDate.getTime(),
				timing: "ends",
			},
		};
	}

	return {
		type: "voting",
		usersForVoting,
		votingEnds: {
			timestamp: nextVotingRange.endDate.getTime(),
			relativeTime: formatDistance(nextVotingRange.endDate, now, {
				addSuffix: true,
			}),
		},
	};
};

export default function PlusVotingPage() {
	const data = useLoaderData<PlusVotingLoaderData>();

	switch (data.type) {
		case "noTimeDefinedInfo": {
			return (
				<div className="text-center text-lighter text-sm">
					Next voting date to be announced
				</div>
			);
		}
		case "timeInfo": {
			return <VotingTimingInfo {...data} />;
		}
		case "voting": {
			return <Voting {...data} />;
		}
		default: {
			assertUnreachable(data);
		}
	}
}

function VotingTimingInfo(
	data: Extract<PlusVotingLoaderData, { type: "timeInfo" }>,
) {
	return (
		<div className="stack md">
			{data.voted ? (
				<div className="plus-voting__alert">
					<CheckmarkIcon /> You have voted
				</div>
			) : null}
			<div className="text-sm text-center">
				{data.timeInfo.timing === "starts"
					? "Next voting starts"
					: "Voting is currently happening. Ends"}{" "}
				<RelativeTime timestamp={data.timeInfo.timestamp}>
					{data.timeInfo.relativeTime}
				</RelativeTime>
			</div>
		</div>
	);
}

const tips = [
	"Voting progress is saved locally",
	"You can use S (-1) and K (+1) keys on desktop to vote",
	"You +1 yourself automatically",
];

function Voting(data: Extract<PlusVotingLoaderData, { type: "voting" }>) {
	const [randomTip] = React.useState(tips[Math.floor(Math.random() * 3)]);
	const { currentUser, previous, votes, addVote, undoLast, isReady, progress } =
		usePlusVoting(data.usersForVoting);

	if (!isReady) return null;

	return (
		<div className="plus-voting__container stack md">
			<div className="stack xs">
				<div className="text-sm text-center">
					Voting ends{" "}
					<RelativeTime timestamp={data.votingEnds.timestamp}>
						{data.votingEnds.relativeTime}
					</RelativeTime>
				</div>
				{progress ? (
					<progress
						className="plus-voting__progress"
						value={progress[0]}
						max={progress[1]}
						title={`Voting progress ${progress[0]} out of ${progress[1]}`}
					/>
				) : null}
			</div>
			{previous ? (
				<p className="button-text-paragraph text-sm text-lighter">
					Previously{" "}
					<span className={previous.score > 0 ? "text-success" : "text-error"}>
						{previous.score > 0 ? "+" : ""}
						{previous.score}
					</span>{" "}
					on {previous.user.username}.
					<Button className="ml-auto" variant="minimal" onClick={undoLast}>
						Undo?
					</Button>
				</p>
			) : (
				<p className="text-sm text-lighter">Tip: {randomTip}</p>
			)}
			{currentUser ? (
				<div className="stack md items-center">
					<Avatar user={currentUser.user} size="lg" />
					<h2>{currentUser.user.username}</h2>
					<div className="stack horizontal lg">
						<Button
							className="plus-voting__vote-button downvote"
							variant="outlined"
							onClick={() => addVote("downvote")}
						>
							-1
						</Button>
						<Button
							className="plus-voting__vote-button"
							variant="outlined"
							onClick={() => addVote("upvote")}
						>
							+1
						</Button>
					</div>
					{currentUser.suggestion ? (
						<PlusSuggestionComments
							suggestion={currentUser.suggestion}
							defaultOpen
						/>
					) : null}
					{currentUser.user.bio ? (
						<>
							<article className="w-full">
								<h2 className="plus-voting__bio-header">Bio</h2>
								{currentUser.user.bio}
							</article>
						</>
					) : null}
				</div>
			) : (
				<Form method="post">
					<input type="hidden" name="votes" value={JSON.stringify(votes)} />
					<Button className="plus-voting__submit-button" type="submit">
						Submit votes
					</Button>
				</Form>
			)}
		</div>
	);
}
