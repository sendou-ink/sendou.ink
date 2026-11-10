import { useEffect, useState } from "react";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import {
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_DESIGN_READY_MESSAGE,
} from "../broadcast-constants";
import type {
	BroadcastDesignMessage,
	BroadcastState,
} from "../broadcast-types";
import { BroadcastOverlay, type BroadcastSceneSet } from "./BroadcastOverlay";

/** The designer's preview: the scene set drawing the mock state the designer embedding it posts. */
export function BroadcastDesignCanvas<State extends BroadcastState>({
	sceneSet,
}: {
	sceneSet: BroadcastSceneSet<State>;
}) {
	const [design, setDesign] = useState<BroadcastDesignMessage<State> | null>(
		null,
	);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (
				event.origin !== window.location.origin ||
				event.source !== window.parent ||
				event.data?.type !== BROADCAST_DESIGN_MESSAGE
			) {
				return;
			}

			setDesign(event.data as BroadcastDesignMessage<State>);
		};

		window.addEventListener("message", onMessage);
		window.parent.postMessage(
			{ type: BROADCAST_DESIGN_READY_MESSAGE },
			window.location.origin,
		);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	if (!design) return null;

	return (
		// a crash (e.g. on a half typed edit) shows nothing, tried again with the next state
		<ClientErrorBoundary fallback={null} resetKeys={[design.state]}>
			<BroadcastOverlay
				sceneSet={sceneSet}
				state={design.state}
				view="live"
				rehearsals={design.rehearsals}
			/>
		</ClientErrorBoundary>
	);
}
