/**
 * Who owns a badge and how many times. A user can own several copies of a badge, one per win: in the edit
 * dialog the owners are a count per user, sent to the server as a list with one user id per copy. Copies come
 * either from a finalized tournament (tied to it, shown in its winners' feed) or from a manager granting them
 * by hand.
 */

interface CountedOwner {
	id: number;
	count: number;
}

interface TournamentWin {
	userId: number;
	tournamentId: number;
}

/** The owners as a list of user ids, a user listed once per copy they own. */
export function toOwnerIds(owners: CountedOwner[]) {
	return owners.flatMap((owner) => Array<number>(owner.count).fill(owner.id));
}

/** How many copies of the badge have been awarded in total. */
export function total(owners: CountedOwner[]) {
	return owners.reduce((sum, owner) => sum + owner.count, 0);
}

/**
 * How the edited owners differ from the current ones, per user whose count changed: how many copies they are
 * added or removed. A user new to the list is added all of their copies.
 */
export function changes<T extends CountedOwner & { username: string }>(
	edited: T[],
	current: CountedOwner[],
) {
	return edited.flatMap((owner) => {
		const currentCount = current.find((o) => o.id === owner.id)?.count ?? 0;
		if (owner.count === currentCount) return [];

		return [
			{
				id: owner.id,
				username: owner.username,
				type:
					owner.count > currentCount
						? ("added" as const)
						: ("removed" as const),
				difference: Math.abs(owner.count - currentCount),
			},
		];
	});
}

/**
 * Splits new owners (one user id per copy) into the tournament wins kept and the copies granted by hand. A
 * user's wins count first towards their new total, the rest of it being a manual grant. Lowering a total below
 * the user's wins removes the most recent ones (highest tournament id).
 */
export function reconcile({
	ownerIds,
	tournamentWins,
}: {
	ownerIds: number[];
	tournamentWins: TournamentWin[];
}) {
	const newCounts = new Map<number, number>();
	for (const userId of ownerIds) {
		newCounts.set(userId, (newCounts.get(userId) ?? 0) + 1);
	}

	const keptWinCounts = new Map<number, number>();
	const removedWins: TournamentWin[] = [];
	for (const win of tournamentWins.toSorted(
		(a, b) => a.tournamentId - b.tournamentId,
	)) {
		const keptCount = keptWinCounts.get(win.userId) ?? 0;
		if (keptCount < (newCounts.get(win.userId) ?? 0)) {
			keptWinCounts.set(win.userId, keptCount + 1);
		} else {
			removedWins.push(win);
		}
	}

	const manualGrants = Array.from(newCounts, ([userId, count]) => ({
		userId,
		count: count - (keptWinCounts.get(userId) ?? 0),
	})).filter((grant) => grant.count > 0);

	return { removedWins, manualGrants };
}
