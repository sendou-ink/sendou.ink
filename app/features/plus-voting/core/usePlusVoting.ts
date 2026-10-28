import * as React from "react";
import type * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { useHydrated } from "~/hooks/useHydrated";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { PLUS_DOWNVOTE, PLUS_UPVOTE } from "../plus-voting-constants";
import { plusVotingPersisted } from "../plus-voting-persisted";
import type { PlusVoteFromFE } from "./types";
import { nextNonCompletedVoting, rangeToMonthYear } from "./voting-time";

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
		setState((current) => {
			if (!current) return current;

			const votedId = current.usersForVoting[current.votes.length]?.user.id;
			if (!votedId) return current;

			const newVotes = [
				...current.votes,
				{ votedId, score: type === "upvote" ? PLUS_UPVOTE : PLUS_DOWNVOTE },
			];

			votesToLocalStorage({
				usersForVoting: current.usersForVoting,
				votes: newVotes,
			});

			return { ...current, votes: newVotes };
		});
	}, []);

	const undoLast = React.useCallback(() => {
		setState((current) => {
			if (!current) return current;

			const newVotes = current.votes.slice(0, -1);

			votesToLocalStorage({
				usersForVoting: current.usersForVoting,
				votes: newVotes,
			});

			return { ...current, votes: newVotes };
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

	const parsedUsersForVoting = PersistedState.read(plusVotingPersisted);

	if (
		!parsedUsersForVoting ||
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
			if (!isVoteHotkey(e)) return;

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

/** A bare key press not meant for a shortcut, a text field or an open dialog. */
function isVoteHotkey(e: KeyboardEvent) {
	if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
		return false;
	}

	const target = e.target;
	if (!(target instanceof HTMLElement)) return true;

	return !(
		target.isContentEditable ||
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		target.closest("[popover], dialog")
	);
}

function previousUser({
	usersForVoting,
	votes,
}: {
	usersForVoting?: PlusVotingRepository.UsersForVoting;
	votes: PlusVoteFromFE[];
}) {
	if (!usersForVoting) return;

	const lastVotedUser = usersForVoting?.[votes.length - 1];
	if (!lastVotedUser) return;

	const previousScore = votes[votes.length - 1]?.score;
	invariant(previousScore);

	return {
		...lastVotedUser,
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

	PersistedState.write(plusVotingPersisted, {
		month,
		year,
		votes,
		usersForVotingOrder: Object.fromEntries(
			usersForVoting.map(({ user }, i) => [user.id, i]),
		),
	});
}
