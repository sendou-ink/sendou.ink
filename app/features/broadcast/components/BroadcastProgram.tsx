import { useEffect, useState } from "react";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { BROADCAST_REHEARSE_MESSAGE } from "../broadcast-constants";
import { useBroadcastStream, useClipReceiver } from "../broadcast-hooks";
import { broadcastOverlaySearchParams } from "../broadcast-search-params";
import type { BroadcastState } from "../broadcast-types";
import { broadcastSignalUrl, broadcastStreamUrl } from "../broadcast-urls";
import { BroadcastOverlay, type BroadcastSceneSet } from "./BroadcastOverlay";

/**
 * The program page's overlay: the scene set drawing the broadcast's state as its stream pushes it, the view,
 * whether it is the dashboard's preview (not counted as an OBS source) and the program key taken from the search params.
 */
export function BroadcastProgram<State extends BroadcastState>({
	sceneSet,
	tournamentId,
	slug,
	initialState,
}: {
	sceneSet: BroadcastSceneSet<State>;
	tournamentId: number;
	slug: string;
	initialState: State;
}) {
	const [{ view, preview, key: programKey }] = useSearchParamsTyped(
		broadcastOverlaySearchParams,
	);
	const pageArgs = { tournamentId, slug };
	const clips = useClipReceiver({ signalUrl: broadcastSignalUrl(pageArgs) });
	const { state, clockOffsetMs } = useBroadcastStream({
		url: broadcastStreamUrl({
			...pageArgs,
			role: preview ? "preview" : "source",
			programKey,
		}),
		initialState,
		onMessage: clips.onMessage,
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
