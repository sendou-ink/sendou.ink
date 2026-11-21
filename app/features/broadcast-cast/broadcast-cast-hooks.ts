import * as React from "react";
import { BroadcastObsAudioContext } from "~/features/broadcast/broadcast-obs-audio-context";
import * as ObsWebSocket from "~/features/broadcast/core/ObsWebSocket";

/**
 * Mutes the capture card in OBS through its WebSocket server while the scene on screen covers the game footage, and
 * unmutes it once the footage is back (or the setting is turned off). Only the page opened from a user's OBS URL does
 * (see `BroadcastObsAudioContext`), not the dashboard's previews or the designer.
 */
export function useObsCaptureMute(isFootageShown: boolean) {
	const obsAudio = React.useContext(BroadcastObsAudioContext);
	const connectionRef = React.useRef<ObsWebSocket.ObsConnection | null>(null);
	const isFootageShownRef = React.useRef(isFootageShown);
	const inputName = obsAudio?.inputName;
	const port = obsAudio?.port;
	const password = obsAudio?.password ?? null;

	React.useEffect(() => {
		isFootageShownRef.current = isFootageShown;
		connectionRef.current?.request("SetInputMute", {
			inputName,
			inputMuted: !isFootageShown,
		});
	}, [isFootageShown, inputName]);

	React.useEffect(() => {
		if (!inputName || !port) return;

		const connection = ObsWebSocket.connect({
			port,
			password,
			onIdentified: () =>
				connection.request("SetInputMute", {
					inputName,
					inputMuted: !isFootageShownRef.current,
				}),
		});
		connectionRef.current = connection;

		return () => {
			connection.request("SetInputMute", { inputName, inputMuted: false });
			connection.close();
			connectionRef.current = null;
		};
	}, [inputName, port, password]);
}
