import * as React from "react";
import type { MatchStation } from "./core/MatchStations";

const MatchStationsContext = React.createContext<
	Partial<Record<number, MatchStation>>
>({});

/** Stations the matches below are queued on, for the station chips of the bracket's match cards. */
export const MatchStationsProvider = MatchStationsContext.Provider;

/** Station the match is queued on, `undefined` when none (or outside a LAN tournament's bracket). */
export function useMatchStation(matchId: number) {
	return React.useContext(MatchStationsContext)[matchId];
}
