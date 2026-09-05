import * as React from "react";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

// outside the to.$id route module on purpose: HMR re-executing a route module gives a context
// created there a new identity, leaving sibling route modules reading the stale one (null)
const TournamentContext = React.createContext<Tournament | null>(null);

/** Rendered by the tournament layout, and again by views loading their own bracket match data to override it. */
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
