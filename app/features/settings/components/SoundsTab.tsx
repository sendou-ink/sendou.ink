import { Volume2 } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import {
	soundEnabledPersisted,
	soundVolumePersisted,
} from "~/features/chat/chat-persisted";
import * as Sounds from "~/features/chat/core/Sounds";
import {
	VOICE_JOIN_SOUND,
	VOICE_LEAVE_SOUND,
} from "~/features/voice/voice-constants";
import { useHydrated } from "~/hooks/useHydrated";
import {
	usePersistedMapState,
	usePersistedState,
} from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import styles from "./SoundsTab.module.css";

export function SoundsTab() {
	const isHydrated = useHydrated();

	return (
		<div className="stack md">
			{isHydrated ? <SoundSlider /> : null}
			{isHydrated ? <SoundCheckboxes /> : null}
		</div>
	);
}

function SoundCheckboxes() {
	const { t } = useTranslation(["settings"]);

	const sounds = [
		{ code: "sq_like", name: t("settings:sounds.likeReceived") },
		{ code: "sq_ready-check", name: t("settings:sounds.readyCheckStarted") },
		{ code: "sq_match", name: t("settings:sounds.matchStarted") },
		{
			code: "tournament_match",
			name: t("settings:sounds.tournamentMatchStarted"),
		},
		{ code: VOICE_JOIN_SOUND, name: t("settings:sounds.voiceJoin") },
		{ code: VOICE_LEAVE_SOUND, name: t("settings:sounds.voiceLeave") },
	];

	const soundEnabled = usePersistedMapState(soundEnabledPersisted);
	const isEnabled = (code: string) =>
		soundEnabled[code] ?? soundEnabledPersisted.default;

	const toggleSound = (code: string) =>
		PersistedState.writeMapEntry(soundEnabledPersisted, code, !isEnabled(code));

	return (
		<div className="stack sm">
			{sounds.map((sound) => (
				<div key={sound.code}>
					<label className="stack horizontal xs items-center">
						<input
							type="checkbox"
							checked={isEnabled(sound.code)}
							onChange={() => toggleSound(sound.code)}
						/>
						{sound.name}
					</label>
				</div>
			))}
		</div>
	);
}

function SoundSlider() {
	const [volume, setVolume] = usePersistedState(soundVolumePersisted);

	const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) =>
		setVolume(Math.floor(Number.parseFloat(event.target.value)));

	const previewVolume = () => Sounds.playIgnoringSetting("sq_like");

	return (
		<div className="stack horizontal xs items-center">
			<Volume2 className={styles.volumeSliderIcon} />
			<input
				className={styles.volumeSliderInput}
				type="range"
				value={volume}
				onChange={changeVolume}
				onTouchEnd={previewVolume}
				onMouseUp={previewVolume}
			/>
		</div>
	);
}
