import { z } from "zod";
import { useUser } from "~/features/auth/core/user";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export const revealedTournamentsPersisted = PersistedState.define({
	key: "spoilerFreeRevealed",
	storage: "session",
	schema: z.array(z.number()),
	default: [],
});

export function useSpoilerFree() {
	const user = useUser();
	const [revealedIds, setRevealedIds] = usePersistedState(
		revealedTournamentsPersisted,
	);

	const isEnabled = Boolean(user?.preferences.spoilerFreeMode);

	const isCensored = (tournamentId: number) =>
		isEnabled && !revealedIds.includes(tournamentId);

	const reveal = (tournamentId: number) => {
		setRevealedIds((previous) => [...previous, tournamentId]);
	};

	const hide = (tournamentId: number) => {
		setRevealedIds((previous) => previous.filter((id) => id !== tournamentId));
	};

	return { isEnabled, isCensored, reveal, hide };
}
