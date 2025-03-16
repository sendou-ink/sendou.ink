import * as React from "react";
import { PLUS_DOWNVOTE, PLUS_UPVOTE } from "~/constants";
import type { User } from "~/db/types";
import type * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import invariant from "~/utils/invariant";
import type { PlusVoteFromFE } from "./types";
import { nextNonCompletedVoting, rangeToMonthYear } from "./voting-time";

const LOCAL_STORAGE_KEY = "plusVoting";

interface VotingLocalStorageData {
	month: number;
	year: number;
	votes: PlusVoteFromFE[];
	/** User id -> order for sorting */
	usersForVotingOrder: Record<User["id"], number>;
}

export function usePlusVoting(
	usersForVotingFromServer: PlusVotingRepository.UsersForVoting,
) {
	const [usersForVoting, setUsersForVoting] =
		React.useState<PlusVotingRepository.UsersForVoting>();
	const [votes, setVotes] = React.useState<PlusVoteFromFE[]>([]);

	const addVote = React.useCallback(
		(type: "upvote" | "downvote") => {
			setVotes((votes) => {
				const votedId = usersForVoting?.[votes.length]?.user.id;
				if (!votedId) return votes;

				const newVotes = [
					...votes,
					{ votedId, score: type === "upvote" ? PLUS_UPVOTE : PLUS_DOWNVOTE },
				];

				votesToLocalStorage({ usersForVoting, votes: newVotes });

				return newVotes;
			});
		},
		[usersForVoting],
	);

	const undoLast = React.useCallback(() => {
		setVotes((votes) => {
			const newVotes = [...votes];
			newVotes.pop();

			votesToLocalStorage({ usersForVoting, votes: newVotes });
			return newVotes;
		});
	}, [usersForVoting]);

	useLoadInitialStateFromLocalStorageEffect({
		usersForVotingFromServer,
		setUsersForVoting,
		setVotes,
	});

	useVoteWithKeysEffect(addVote);

	const currentUser = usersForVoting?.[votes.length];

	const progress: [currentAmount: number, targetAmount: number] | undefined =
		usersForVoting ? [votes.length, usersForVoting.length] : undefined;

	return {
		votes,
		addVote,
		undoLast,
		currentUser,
		previous: previousUser({ usersForVoting, votes }),
		isReady: Boolean(usersForVoting),
		progress,
	};
}

function useLoadInitialStateFromLocalStorageEffect({
	usersForVotingFromServer,
	setUsersForVoting,
	setVotes,
}: {
	usersForVotingFromServer: PlusVotingRepository.UsersForVoting;
	setUsersForVoting: React.Dispatch<
		React.SetStateAction<PlusVotingRepository.UsersForVoting | undefined>
	>;
	setVotes: React.Dispatch<React.SetStateAction<PlusVoteFromFE[]>>;
}) {
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");
	const { month, year } = rangeToMonthYear(range);

	React.useEffect(() => {
		const usersForVotingFromLocalStorage =
			localStorage.getItem(LOCAL_STORAGE_KEY);

		if (!usersForVotingFromLocalStorage) {
			setUsersForVoting(usersForVotingFromServer);
			return;
		}

		const parsedUsersForVoting = JSON.parse(
			usersForVotingFromLocalStorage,
		) as VotingLocalStorageData;

		if (
			parsedUsersForVoting.month !== month ||
			parsedUsersForVoting.year !== year
		) {
			setUsersForVoting(usersForVotingFromServer);
			return;
		}

		let usersForVotingForState = usersForVotingFromServer;

		// bit of defensive coding in case for some reason the local storage data is out of date
		try {
			usersForVotingForState = [...usersForVotingFromServer].sort((a, b) => {
				const aOrder = parsedUsersForVoting.usersForVotingOrder[a.user.id];
				const bOrder = parsedUsersForVoting.usersForVotingOrder[b.user.id];

				if (typeof aOrder !== "number") {
					throw new Error(`No order for user with id ${a.user.id}`);
				}
				if (typeof bOrder !== "number") {
					throw new Error(`No order for user with id ${b.user.id}`);
				}

				return aOrder - bOrder;
			});
			setVotes(parsedUsersForVoting.votes);
		} catch (e) {
			console.error(e);
		}

		setUsersForVoting(usersForVotingForState);
	}, [month, year, usersForVotingFromServer, setUsersForVoting, setVotes]);
}

function useVoteWithKeysEffect(vote: (type: "upvote" | "downvote") => void) {
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "KeyS") {
				vote("downvote");
			} else if (e.code === "KeyK") {
				vote("upvote");
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [vote]);
}

function previousUser({
	usersForVoting,
	votes,
}: {
	usersForVoting?: PlusVotingRepository.UsersForVoting;
	votes: PlusVoteFromFE[];
}) {
	if (!usersForVoting) return;

	const previousUser = usersForVoting?.[votes.length - 1];
	if (!previousUser) return;

	const previousScore = votes[votes.length - 1]?.score;
	invariant(previousScore);

	return {
		...previousUser,
		score: previousScore,
	};
}

function votesToLocalStorage({
	usersForVoting,
	votes,
}: {
	usersForVoting?: PlusVotingRepository.UsersForVoting;
	votes: PlusVoteFromFE[];
}) {
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");

	const { month, year } = rangeToMonthYear(range);

	invariant(usersForVoting);
	const toLocalStorage: VotingLocalStorageData = {
		month,
		year,
		votes,
		usersForVotingOrder: Object.fromEntries(
			usersForVoting.map(({ user }, i) => [user.id, i]),
		),
	};
	localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toLocalStorage));
}
