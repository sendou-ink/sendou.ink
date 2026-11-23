import * as React from "react";
import { BroadcastObsAudioContext } from "~/features/broadcast/broadcast-obs-audio-context";
import * as ObsWebSocket from "~/features/broadcast/core/ObsWebSocket";
import { BROADCAST_VOLUME_SAVE_INTERVAL_MS } from "./broadcast-cast-constants";

/** How long a released fader keeps its value at most while waiting for the state with it saved. */
const RELEASED_VOLUME_HOLD_MS = 3000;

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

/**
 * A volume fader saved as it moves, at most every so often, showing the value it's moved to until the state with it
 * saved arrives. Pass `change` to the fader's input and `release` to it being let go.
 */
export function useVolumeFader({
	saved,
	save,
}: {
	/** The volume as saved, 0-100. */
	saved: number;
	save: (volume: number) => void;
}) {
	const [draft, setDraft] = React.useState<{
		volume: number;
		isReleased: boolean;
	} | null>(null);
	const lastSaveAt = React.useRef(0);
	const pendingSave = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const volume =
		draft && (!draft.isReleased || draft.volume !== saved)
			? draft.volume
			: saved;

	const saveNow = (newVolume: number) => {
		if (pendingSave.current) clearTimeout(pendingSave.current);
		pendingSave.current = null;
		lastSaveAt.current = Date.now();
		save(newVolume);
	};

	const change = (newVolume: number) => {
		setDraft({ volume: newVolume, isReleased: false });

		const sinceLastSave = Date.now() - lastSaveAt.current;
		if (sinceLastSave >= BROADCAST_VOLUME_SAVE_INTERVAL_MS) {
			saveNow(newVolume);
		} else {
			if (pendingSave.current) clearTimeout(pendingSave.current);
			pendingSave.current = setTimeout(
				() => saveNow(newVolume),
				BROADCAST_VOLUME_SAVE_INTERVAL_MS - sinceLastSave,
			);
		}
	};

	const release = () => {
		if (!draft || draft.isReleased) return;

		if (pendingSave.current) saveNow(draft.volume);
		const released = { ...draft, isReleased: true };
		setDraft(released);
		// a save that never comes back (or a volume changed by someone else since) shows the saved volume after all
		setTimeout(
			() => setDraft((current) => (current === released ? null : current)),
			RELEASED_VOLUME_HOLD_MS,
		);
	};

	return { volume, change, release };
}
