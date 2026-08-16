import * as React from "react";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

// Lives outside the to.$id route module on purpose: a context created inside a
// route module gets a new identity when HMR re-executes that module, leaving
// consumers in sibling route modules reading the stale context (null).
const TournamentContext = React.createContext<Tournament | null>(null);

/**
 * Provides the tournament of the subtree. Rendered by the tournament layout,
 * and rendered again by views that load bracket match data of their own to
 * override the layout's tournament.
 */
export function TournamentProvider({
	tournament,
	children,
}: {
	tournament: Tournament;
	children: React.ReactNode;
}) {
	return (
		<TournamentContext.Provider value={tournament}>
			{children}
		</TournamentContext.Provider>
	);
}

export function useTournament() {
	const tournament = React.useContext(TournamentContext);
	if (!tournament) {
		throw new Error("useTournament must be used within TournamentProvider");
	}
	return tournament;
}
