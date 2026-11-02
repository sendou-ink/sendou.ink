import {
	broadcastOverlaySearchParams,
	broadcastStreamSearchParams,
} from "./broadcast-search-params";
import type { BroadcastStreamRole, BroadcastView } from "./broadcast-types";

interface BroadcastPageArgs {
	tournamentId: number;
	slug: string;
}

// xxx: just put to global urls.ts or not?

export const tournamentBroadcastsPage = (tournamentId: number) =>
	`/to/${tournamentId}/broadcast`;

export const broadcastDashboardPage = ({
	tournamentId,
	slug,
}: BroadcastPageArgs) => `${tournamentBroadcastsPage(tournamentId)}/${slug}`;

/** The overlay OBS shows as a browser source, switching scenes on its own. */
export const broadcastOverlayPage = ({
	view = "live",
	preview = false,
	...args
}: BroadcastPageArgs & {
	view?: BroadcastView;
	preview?: boolean;
}) =>
	broadcastOverlaySearchParams.href(`${broadcastDashboardPage(args)}/program`, {
		view,
		preview,
	});

export const broadcastStreamUrl = ({
	role,
	...args
}: BroadcastPageArgs & { role: BroadcastStreamRole }) =>
	broadcastStreamSearchParams.href(`${broadcastDashboardPage(args)}/stream`, {
		role,
	});

/** Where the dashboard and overlays post their WebRTC session descriptions to each other. */
export const broadcastSignalUrl = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/signal`;

/** Where the scanner watching the game feed posts the games it sees starting and ending. */
export const broadcastGameUrl = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/game`;
