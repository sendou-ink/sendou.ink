/**
 * The capture source: one select listing every video input, the capture
 * card first and OBS Virtual Camera as just another entry, and under it what
 * clips hear: the source's own audio, the desktop's sound, any audio input
 * or nothing. Browsers reveal ids and labels only once camera permission is
 * granted, so the list is re-read whenever a capture starts or stops, and
 * opening a select while it is still anonymous asks for the permission
 * right there. Both choices are remembered in localStorage.
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
import {
	type AudioSource,
	updateSettings,
	useScannerSettings,
} from "./settings";

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
	const audioInputs = inputs.audio.filter((device) => device.deviceId !== "");
	const selected = settings.sourceDeviceId
		? videoInputs.find((device) => device.deviceId === settings.sourceDeviceId)
		: undefined;
	const sourceAudio = selected ? audioInputFor(selected, inputs.audio) : null;

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
			<select
				className={styles.select}
				aria-label="Audio for clips"
				disabled={disabled}
				onPointerDown={reveal}
				onKeyDown={reveal}
				value={settings.audioSource}
				onChange={(e) =>
					updateSettings({ audioSource: e.target.value as AudioSource })
				}
			>
				<option value="source">Source audio</option>
				<option value="desktop" disabled={!supportsDesktopAudio()}>
					Desktop audio
				</option>
				{audioInputs.map((device) => (
					<option key={device.deviceId} value={`device:${device.deviceId}`}>
						{device.label || `Audio input ${device.deviceId.slice(0, 6)}`}
					</option>
				))}
				<option value="off">No audio</option>
			</select>
			<span className={styles.audio}>
				{audioNote(settings.audioSource, selected, sourceAudio)}
			</span>
		</div>
	);
}

function audioNote(
	source: AudioSource,
	video: MediaDeviceInfo | undefined,
	sourceAudio: MediaDeviceInfo | null,
): string {
	switch (source) {
		case "source":
			if (!video) return "audio: pick a source to use its own audio";
			return sourceAudio
				? `audio from ${sourceAudio.label || "the source"}`
				: "audio: none for this source, clips will be silent";
		case "desktop":
			return 'a share picker opens with the capture: pick a screen and tick "Also share system audio"';
		case "off":
			return "clips will be silent";
		default:
			return "clips hear this input";
	}
}

function supportsDesktopAudio(): boolean {
	return (
		typeof navigator !== "undefined" &&
		Boolean(navigator.mediaDevices?.getDisplayMedia)
	);
}

function deviceLabel(device: MediaDeviceInfo): string {
	if (isVirtualCamera(device)) return "OBS Virtual Camera (no audio)";
	return device.label || `Camera ${device.deviceId.slice(0, 6)}`;
}
