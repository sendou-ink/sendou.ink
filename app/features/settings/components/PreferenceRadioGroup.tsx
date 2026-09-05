import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { SendouRadio, SendouRadioGroup } from "~/components/elements/Radio";
import type { Preference } from "~/db/tables-json";
import { preferenceEmojiUrl } from "~/utils/urls";
import styles from "./PreferenceRadioGroup.module.css";

export function PreferenceRadioGroup({
	preference,
	onPreferenceChange,
	"aria-label": ariaLabel,
}: {
	preference?: Preference;
	onPreferenceChange: (preference: Preference & "NEUTRAL") => void;
	"aria-label": string;
}) {
	const { t } = useTranslation(["settings"]);

	return (
		<SendouRadioGroup
			value={preference ?? "NEUTRAL"}
			onChange={(newPreference) =>
				onPreferenceChange(newPreference as Preference & "NEUTRAL")
			}
			className="stack horizontal xs"
			aria-label={ariaLabel}
		>
			<SendouRadio value="AVOID" aria-label="Avoid the mode">
				{({ isSelected, isFocusVisible }) => (
					<span
						className={clsx(styles.radio, {
							[styles.checked]: isSelected,
							[styles.focusVisible]: isFocusVisible,
						})}
					>
						<img
							src={preferenceEmojiUrl("AVOID")}
							className={styles.emoji}
							width={18}
							alt="Avoid emoji"
						/>
						{t("settings:matchProfile.maps.avoid")}
					</span>
				)}
			</SendouRadio>
			<SendouRadio value="NEUTRAL" aria-label="Neutral towards the mode">
				{({ isSelected, isFocusVisible }) => (
					<span
						className={clsx(styles.radio, {
							[styles.checked]: isSelected,
							[styles.focusVisible]: isFocusVisible,
						})}
					>
						<img
							src={preferenceEmojiUrl()}
							className={styles.emoji}
							width={18}
							alt="Neutral emoji"
						/>
						{t("settings:matchProfile.maps.neutral")}
					</span>
				)}
			</SendouRadio>
			<SendouRadio value="PREFER" aria-label="Prefer the mode">
				{({ isSelected, isFocusVisible }) => (
					<span
						className={clsx(styles.radio, {
							[styles.checked]: isSelected,
							[styles.focusVisible]: isFocusVisible,
						})}
					>
						<img
							src={preferenceEmojiUrl("PREFER")}
							className={styles.emoji}
							width={18}
							alt="Prefer emoji"
						/>
						{t("settings:matchProfile.maps.prefer")}
					</span>
				)}
			</SendouRadio>
		</SendouRadioGroup>
	);
}
