import { Volume2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as Sounds from "~/features/chat/core/Sounds";
import { useHydrated } from "~/hooks/useHydrated";
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
	];

	const [soundValues, setSoundValues] = React.useState(
		Object.fromEntries(
			sounds.map((sound) => [sound.code, Sounds.isEnabled(sound.code)]),
		),
	);

	const toggleSound = (code: string) => {
		localStorage.setItem(
			Sounds.localStorageKey(code),
			String(!Sounds.isEnabled(code)),
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
	const [volume, setVolume] = React.useState(() => Sounds.volume() || 100);

	const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newVolume = Number.parseFloat(event.target.value);
		setVolume(newVolume);
		localStorage.setItem(
			"settings__sound-volume",
			String(Math.floor(newVolume)),
		);
	};

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
