import { Volume2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	soundCodeToLocalStorageKey,
	soundVolume,
} from "~/features/chat/chat-utils";
import { useHydrated } from "~/hooks/useHydrated";
import { soundPath } from "~/utils/urls";
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
		{ code: "sq_new-group", name: t("settings:sounds.groupNewMember") },
		{ code: "sq_match", name: t("settings:sounds.matchStarted") },
		{
			code: "tournament_match",
			name: t("settings:sounds.tournamentMatchStarted"),
		},
	];

	const currentValue = (code: string) =>
		!localStorage.getItem(soundCodeToLocalStorageKey(code)) ||
		localStorage.getItem(soundCodeToLocalStorageKey(code)) === "true";

	const [soundValues, setSoundValues] = React.useState(
		Object.fromEntries(
			sounds.map((sound) => [sound.code, currentValue(sound.code)]),
		),
	);

	const toggleSound = (code: string) => {
		localStorage.setItem(
			soundCodeToLocalStorageKey(code),
			String(!currentValue(code)),
		);
		setSoundValues((prev) => ({
			...prev,
			[code]: !prev[code],
		}));
	};

	return (
		<div className="stack sm">
			{sounds.map((sound) => (
				<div key={sound.code}>
					<label className="stack horizontal xs items-center">
						<input
							type="checkbox"
							checked={soundValues[sound.code]}
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
	const [volume, setVolume] = React.useState(() => soundVolume() || 100);

	const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newVolume = Number.parseFloat(event.target.value);
		setVolume(newVolume);
		localStorage.setItem(
			"settings__sound-volume",
			String(Math.floor(newVolume)),
		);
	};

	const playSound = () => {
		const audio = new Audio(soundPath("sq_like"));
		audio.volume = soundVolume() / 100;
		void audio.play();
	};

	return (
		<div className="stack horizontal xs items-center">
			<Volume2 className={styles.volumeSliderIcon} />
			<input
				className={styles.volumeSliderInput}
				type="range"
				value={volume}
				onChange={changeVolume}
				onTouchEnd={playSound}
				onMouseUp={playSound}
			/>
		</div>
	);
}
