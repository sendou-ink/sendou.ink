/**
 * The capture source: one select listing every video input, the capture
 * card first and OBS Virtual Camera as just another entry. Browsers reveal
 * ids and labels only once camera permission is granted, so the list is
 * re-read whenever a capture starts or stops, and opening the select while
 * it is still anonymous asks for the permission right there. The choice is
 * remembered in localStorage.
 */
import { useEffect, useState } from "react";
import {
	audioInputFor,
	inputsRevealed,
	isVirtualCamera,
	listMediaInputs,
	type MediaInputs,
	requestInputAccess,
} from "../capture/sampler";
import { useLiveSession } from "./live-session";
import styles from "./SourceSelect.module.css";
import { updateSettings, useScannerSettings } from "./settings";

const NO_INPUTS: MediaInputs = { video: [], audio: [] };

export function SourceSelect({ disabled }: { disabled?: boolean }) {
	const settings = useScannerSettings();
	const live = useLiveSession();
	const [inputs, setInputs] = useState<MediaInputs>(NO_INPUTS);
	const [revision, setRevision] = useState(0);

	// device enumeration is a browser API, not React state; a capture starting
	// is what grants the permission that reveals the list
	useEffect(() => {
		let stale = false;
		const load = () => {
			void listMediaInputs().then(
				(next) => {
					if (!stale) setInputs(next);
				},
				() => {},
			);
		};
		load();
		navigator.mediaDevices?.addEventListener("devicechange", load);
		return () => {
			stale = true;
			navigator.mediaDevices?.removeEventListener("devicechange", load);
		};
	}, [live.status, revision]);

	const reveal = () => {
		if (inputsRevealed(inputs)) return;
		void requestInputAccess().then((granted) => {
			if (granted) setRevision((r) => r + 1);
		});
	};

	// before the first granted permission Chromium lists devices with empty
	// ids and labels, which would collide with the default entry
	const videoInputs = inputs.video.filter((device) => device.deviceId !== "");
	const selected = settings.sourceDeviceId
		? videoInputs.find((device) => device.deviceId === settings.sourceDeviceId)
		: undefined;
	const audio = selected ? audioInputFor(selected, inputs.audio) : null;

	return (
		<div className={styles.source}>
			<select
				className={styles.select}
				aria-label="Source"
				disabled={disabled}
				onPointerDown={reveal}
				onKeyDown={reveal}
				value={selected ? settings.sourceDeviceId : ""}
				onChange={(e) => updateSettings({ sourceDeviceId: e.target.value })}
			>
				<option value="">Default camera</option>
				{videoInputs.map((device) => (
					<option key={device.deviceId} value={device.deviceId}>
						{deviceLabel(device)}
					</option>
				))}
			</select>
			{selected ? (
				<span className={styles.audio}>
					{audio
						? `audio from ${audio.label || "the source"}`
						: "audio: none, clips will be silent"}
				</span>
			) : null}
		</div>
	);
}

function deviceLabel(device: MediaDeviceInfo): string {
	if (isVirtualCamera(device)) return "OBS Virtual Camera (no audio)";
	return device.label || `Camera ${device.deviceId.slice(0, 6)}`;
}
