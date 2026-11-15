import { useEffect, useState } from "react";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { BROADCAST_REHEARSE_MESSAGE } from "../broadcast-constants";
import { useBroadcastStream, useClipReceiver } from "../broadcast-hooks";
import { broadcastOverlaySearchParams } from "../broadcast-search-params";
import type {
	BroadcastState,
	BroadcastStreamMessage,
} from "../broadcast-types";
import {
	broadcastProgramStreamUrl,
	broadcastSignalUrl,
	broadcastStreamUrl,
} from "../broadcast-urls";
import { BroadcastOverlay, type BroadcastSceneSet } from "./BroadcastOverlay";

/**
 * The program page's overlay: the scene set drawing the broadcast's state as its stream pushes it. Opened from a user's
 * OBS URL (`programKey`) it streams through that URL and loads again once the URL is pointed at another broadcast.
 * Otherwise the view and whether it is the dashboard's preview (not counted as an OBS source) come from the search params.
 */
export function BroadcastProgram<State extends BroadcastState>({
	sceneSet,
	tournamentId,
	slug,
	initialState,
	programKey,
}: {
	sceneSet: BroadcastSceneSet<State>;
	tournamentId: number;
	slug: string;
	initialState: State;
	programKey?: string;
}) {
	const [{ view, preview }] = useSearchParamsTyped(
		broadcastOverlaySearchParams,
	);
	const pageArgs = { tournamentId, slug };
	const clips = useClipReceiver({ signalUrl: broadcastSignalUrl(pageArgs) });
	const { state, clockOffsetMs } = useBroadcastStream({
		url: programKey
			? broadcastProgramStreamUrl(programKey)
			: broadcastStreamUrl({
					...pageArgs,
					role: preview ? "preview" : "source",
				}),
		initialState,
		onMessage: (message) => {
			if (message.kind === "reload") window.location.reload();
			else clips.onMessage(message);
		},
	});
	const rehearsals = useRehearsals({ isEnabled: preview });

	return (
		<BroadcastClipsContext.Provider
			value={{ urls: clips.urls, isMuted: preview, clockOffsetMs }}
		>
			{/* a crash shows nothing over the footage, tried again with the next state */}
			<ClientErrorBoundary fallback={null} resetKeys={[state]}>
				<BroadcastOverlay
					sceneSet={sceneSet}
					state={state}
					view={view}
					rehearsals={rehearsals}
				/>
			</ClientErrorBoundary>
		</BroadcastClipsContext.Provider>
	);
}

/**
 * A user's OBS URL not pointed at a broadcast: shows nothing, and loads again once its stream says the URL shows one
 * (a `reload`, or a broadcast's messages after reconnecting).
 */
export function BroadcastProgramStandby({
	programKey,
}: {
	programKey: string;
}) {
	useEffect(() => {
		const source = new EventSource(broadcastProgramStreamUrl(programKey));
		source.onmessage = (event) => {
			const message = JSON.parse(event.data) as BroadcastStreamMessage;
			// anything but a heartbeat: told to reload, or reconnected to a broadcast after the URL was pointed at one
			if (message.kind !== "heartbeat") window.location.reload();
		};

		return () => source.close();
	}, [programKey]);

	return null;
}

/** How many times the dashboard embedding this preview asked it to play the staged transition. */
function useRehearsals({ isEnabled }: { isEnabled: boolean }) {
	const [rehearsals, setRehearsals] = useState(0);

	useEffect(() => {
		if (!isEnabled) return;

		const onMessage = (event: MessageEvent) => {
			if (
				event.origin !== window.location.origin ||
				event.data !== BROADCAST_REHEARSE_MESSAGE
			) {
				return;
			}

			setRehearsals((count) => count + 1);
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [isEnabled]);

	return rehearsals;
}
