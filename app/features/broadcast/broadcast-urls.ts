import { Config } from "~/config";
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

/** Where the overlays' styles are edited over a mock broadcast. */
export const broadcastDesignPage = (args: BroadcastPageArgs) =>
	`${broadcastDashboardPage(args)}/design`;

/** The overlay of the designer's preview, rendering what the designer posts to it. */
export const broadcastDesignCanvasPage = (args: BroadcastPageArgs) =>
	`${broadcastDesignPage(args)}/canvas`;

/**
 * The overlay OBS shows as a browser source, switching scenes on its own. Only producers see it without the
 * broadcast's program key.
 */
export const broadcastOverlayPage = ({
	view = "live",
	preview = false,
	programKey = null,
	...args
}: BroadcastPageArgs & {
	view?: BroadcastView;
	preview?: boolean;
	programKey?: string | null;
}) =>
	broadcastOverlaySearchParams.href(`${broadcastDashboardPage(args)}/program`, {
		view,
		preview,
		key: programKey,
	});

export const broadcastStreamUrl = ({
	role,
	programKey = null,
	...args
}: BroadcastPageArgs & {
	role: BroadcastStreamRole;
	programKey?: string | null;
}) =>
	broadcastStreamSearchParams.href(`${broadcastDashboardPage(args)}/stream`, {
		role,
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
