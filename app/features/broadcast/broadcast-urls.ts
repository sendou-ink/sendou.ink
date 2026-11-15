import { Config } from "~/config";
import {
	broadcastOverlaySearchParams,
	broadcastProgramSearchParams,
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

/** Where the overlays' styles are edited over a mock broadcast. */
export const broadcastDesignPage = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/design`;

/** The overlay of the designer's preview, rendering what the designer posts to it. */
export const broadcastDesignCanvasPage = (args: BroadcastPageArgs) =>
	`${broadcastDesignPage(args)}/canvas`;

/** The broadcast's overlay switching scenes on its own, for its producers (e.g. the dashboard's previews). */
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
}: BroadcastPageArgs & {
	role: BroadcastStreamRole;
}) =>
	broadcastStreamSearchParams.href(`${broadcastDashboardPage(args)}/stream`, {
		role,
	});

const BROADCAST_PROGRAM_PAGE = "/broadcast/program";

/**
 * A user's OBS URL: the overlay OBS shows as a browser source, of the tournament broadcast the user last pointed it at.
 * The key identifies it, so it stays the same from tournament to tournament.
 */
export const broadcastProgramPage = (programKey: string) =>
	broadcastProgramSearchParams.href(BROADCAST_PROGRAM_PAGE, {
		key: programKey,
	});

/** The stream of {@link broadcastProgramPage}. */
export const broadcastProgramStreamUrl = (programKey: string) =>
	broadcastProgramSearchParams.href(`${BROADCAST_PROGRAM_PAGE}/stream`, {
		key: programKey,
	});

/** Where the dashboard and overlays post their WebRTC session descriptions to each other. */
export const broadcastSignalUrl = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/signal`;

/** Where the scanner watching the game feed posts the games it sees starting and ending. */
export const broadcastGameUrl = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/game`;

/** An image of the designer's mock broadcast (footage, avatars, logos), in the static assets under `img/broadcast/`. */
export const broadcastDesignImageUrl = (path: string) =>
	`${Config.staticAssetsUrl}/img/broadcast/${path}`;
