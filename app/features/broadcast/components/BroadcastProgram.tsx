import { useEffect, useRef, useState } from "react";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { BROADCAST_REHEARSE_MESSAGE } from "../broadcast-constants";
import { useBroadcastStream, useClipReceiver } from "../broadcast-hooks";
import { BroadcastObsAudioContext } from "../broadcast-obs-audio-context";
import { markOnAirIfLoaded } from "../broadcast-on-air";
import { broadcastOverlaySearchParams } from "../broadcast-search-params";
import type {
	BroadcastKey,
	BroadcastObsAudio,
	BroadcastState,
} from "../broadcast-types";
import {
	broadcastProgramStreamUrl,
	broadcastStreamUrl,
} from "../broadcast-urls";
import { clipCache } from "../store/clip-cache";
import { BroadcastOverlay, type BroadcastSceneSet } from "./BroadcastOverlay";

// opacity, not visibility, which the scenes can set back on parts of their own
const HIDDEN_STYLE = { opacity: 0 };

/**
 * The program page's overlay: the scene set drawing the broadcast's state as its stream pushes it. Opened from a user's
 * OBS URL (`programKey`) it streams through that URL, switching over to the broadcast the URL gets pointed at without
 * loading the page again (showing nothing until there is one). Otherwise it streams `broadcast`'s state, the
 * view and whether it is the dashboard's preview (not counted as an OBS source) coming from the search params.
 * Opened from an OBS URL it also mutes the capture card the way the URL's user set (`initialObsAudio`, then as they change it).
 *
 * Nothing shows until the page has hydrated with its stylesheets (see `markOnAirIfLoaded`), or once the stream says
 * the broadcast is gone.
 */
export function BroadcastProgram<State extends BroadcastState>(
	props: {
		sceneSet: BroadcastSceneSet<State>;
		initialState: State | null;
		initialObsAudio?: BroadcastObsAudio | null;
	} & (
		| {
				programKey: string;
				/** What the OBS URL shows as the page loads, `null` for no broadcast. */
				broadcast: BroadcastKey | null;
		  }
		| { programKey?: undefined; broadcast: BroadcastKey }
	),
) {
	const { sceneSet, broadcast, initialState, initialObsAudio = null } = props;
	const [{ view, preview }] = useSearchParamsTyped(
		broadcastOverlaySearchParams,
	);
	const [obsAudio, setObsAudio] = useState(initialObsAudio);
	const [shown, setShown] = useState({
		broadcastId: broadcastIdOf(broadcast),
		isGone: false,
	});
	// the broadcast the stream said it is connected to, whose states follow
	const connectedToRef = useRef(broadcast);
	const isLoaded = useIsOnAirLoaded();
	const clips = useClipReceiver({
		// the previews are the dashboard's own, it sends them what they need again quickly
		cache: preview ? undefined : clipCache,
	});
	const { state, clockOffsetMs } = useBroadcastStream<State | null, State>({
		url:
			props.programKey !== undefined
				? broadcastProgramStreamUrl(props.programKey)
				: broadcastStreamUrl({
						...props.broadcast,
						role: preview ? "preview" : "source",
					}),
		initialState,
		onMessage: (message) => {
			if (message.kind === "hello") {
				connectedToRef.current = message.broadcast;
			} else if (message.kind === "state") {
				// another broadcast's state starts its overlay afresh, not as a Take from the last one's
				setShown({
					broadcastId: broadcastIdOf(connectedToRef.current),
					isGone: false,
				});
			} else if (message.kind === "gone") {
				setShown((current) => ({ ...current, isGone: true }));
			} else if (message.kind === "obsAudio") {
				setObsAudio(message.obsAudio);
			}
			clips.onMessage(message);
		},
	});
	const rehearsals = useRehearsals({ isEnabled: preview });
	const shownState = shown.isGone ? null : state;

	return (
		<BroadcastClipsContext.Provider
			value={{
				files: clips.clips,
				isMuted: preview,
				clockOffsetMs,
				reportFeeds: clips.sendFeeds,
			}}
		>
			<BroadcastObsAudioContext.Provider value={obsAudio}>
				<div style={isLoaded ? undefined : HIDDEN_STYLE}>
					{shownState ? (
						// a crash shows nothing over the footage, tried again with the next state
						<ClientErrorBoundary fallback={null} resetKeys={[shownState]}>
							<BroadcastOverlay
								key={shown.broadcastId}
								sceneSet={sceneSet}
								state={shownState}
								view={view}
								rehearsals={rehearsals}
							/>
						</ClientErrorBoundary>
					) : null}
				</div>
			</BroadcastObsAudioContext.Provider>
		</BroadcastClipsContext.Provider>
	);
}

/** Whether the page is loaded well enough to go on air, see `markOnAirIfLoaded`. `false` as it hydrates. */
function useIsOnAirLoaded() {
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		setIsLoaded(markOnAirIfLoaded());
	}, []);

	return isLoaded;
}

function broadcastIdOf(broadcast: BroadcastKey | null) {
	return broadcast ? `${broadcast.tournamentId}:${broadcast.slug}` : "";
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
