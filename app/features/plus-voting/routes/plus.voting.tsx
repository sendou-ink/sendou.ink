import type { MetaFunction } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { RelativeTime } from "~/components/RelativeTime";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { usePlusVoting } from "~/features/plus-voting/core";
import { metaTags } from "~/utils/remix";
import { assertUnreachable } from "~/utils/types";
import { PlusSuggestionComments } from "../../plus-suggestions/routes/plus.suggestions";

import { action } from "../actions/plus.voting.server";
import {
	type PlusVotingLoaderData,
	loader,
} from "../loaders/plus.voting.server";
export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Plus Server Voting",
		location: args.location,
	});
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
