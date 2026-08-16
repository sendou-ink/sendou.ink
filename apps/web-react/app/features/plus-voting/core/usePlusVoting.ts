import * as React from "react";
import type { Tables } from "~/db/tables";
import type * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { useHydrated } from "~/hooks/useHydrated";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { PLUS_DOWNVOTE, PLUS_UPVOTE } from "../plus-voting-constants";
import type { PlusVoteFromFE } from "./types";
import { nextNonCompletedVoting, rangeToMonthYear } from "./voting-time";

const LOCAL_STORAGE_KEY = "plusVoting";

interface VotingLocalStorageData {
	month: number;
	year: number;
	votes: PlusVoteFromFE[];
	/** User id -> order for sorting */
	usersForVotingOrder: Record<Tables["User"]["id"], number>;
}

interface VotingState {
	usersForVoting: PlusVotingRepository.UsersForVoting;
	votes: PlusVoteFromFE[];
}

export function usePlusVoting(
	usersForVotingFromServer: PlusVotingRepository.UsersForVoting,
) {
	const isHydrated = useHydrated();
	const [state, setState] = React.useState<VotingState | null>(null);

	if (isHydrated && state === null) {
		setState(resolveInitialVotingState(usersForVotingFromServer));
	}

	const addVote = React.useCallback((type: "upvote" | "downvote") => {
		setState((state) => {
			if (!state) return state;

			const votedId = state.usersForVoting[state.votes.length]?.user.id;
			if (!votedId) return state;

			const newVotes = [
				...state.votes,
				{ votedId, score: type === "upvote" ? PLUS_UPVOTE : PLUS_DOWNVOTE },
			];

			votesToLocalStorage({
				usersForVoting: state.usersForVoting,
				votes: newVotes,
			});

			return { ...state, votes: newVotes };
		});
	}, []);

	const undoLast = React.useCallback(() => {
		setState((state) => {
			if (!state) return state;

			const newVotes = state.votes.slice(0, -1);

			votesToLocalStorage({
				usersForVoting: state.usersForVoting,
				votes: newVotes,
			});

			return { ...state, votes: newVotes };
		});
	}, []);

	useVoteWithKeysEffect(addVote);

	const usersForVoting = state?.usersForVoting;
	const votes = state?.votes ?? [];

	const currentUser = usersForVoting?.[votes.length];

	const progress: [currentAmount: number, targetAmount: number] | undefined =
		usersForVoting ? [votes.length, usersForVoting.length] : undefined;

	return {
		votes,
		addVote,
		undoLast,
		currentUser,
		previous: previousUser({ usersForVoting, votes }),
		isReady: state !== null,
		progress,
	};
}

function resolveInitialVotingState(
	usersForVotingFromServer: PlusVotingRepository.UsersForVoting,
): VotingState {
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");
	const { month, year } = rangeToMonthYear(range);

	const usersForVotingFromLocalStorage =
		localStorage.getItem(LOCAL_STORAGE_KEY);

	if (!usersForVotingFromLocalStorage) {
		return { usersForVoting: usersForVotingFromServer, votes: [] };
	}

	const parsedUsersForVoting = JSON.parse(
		usersForVotingFromLocalStorage,
	) as VotingLocalStorageData;

	if (
		parsedUsersForVoting.month !== month ||
		parsedUsersForVoting.year !== year
	) {
		return { usersForVoting: usersForVotingFromServer, votes: [] };
	}

	// bit of defensive coding in case for some reason the local storage data is out of date
	try {
		const sortedUsersForVoting = [...usersForVotingFromServer].sort((a, b) => {
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

		return {
			usersForVoting: sortedUsersForVoting,
			votes: parsedUsersForVoting.votes,
		};
	} catch (e) {
		logger.error(e);
		return { usersForVoting: usersForVotingFromServer, votes: [] };
	}
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
	usersForVoting: PlusVotingRepository.UsersForVoting;
	votes: PlusVoteFromFE[];
}) {
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");

	const { month, year } = rangeToMonthYear(range);

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
