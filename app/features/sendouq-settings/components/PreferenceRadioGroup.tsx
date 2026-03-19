import clsx from "clsx";
import { Radio, RadioGroup } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { Preference } from "~/db/tables";
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
	const { t } = useTranslation(["q"]);

	return (
		<RadioGroup
			value={preference ?? "NEUTRAL"}
			onChange={(newPreference) =>
				onPreferenceChange(newPreference as Preference & "NEUTRAL")
			}
			className="stack horizontal xs"
			aria-label={ariaLabel}
			orientation="horizontal"
		>
			<Radio value="AVOID" aria-label="Avoid the mode">
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
						{t("q:settings.maps.avoid")}
					</span>
				)}
			</Radio>
			<Radio value="NEUTRAL" aria-label="Neutral towards the mode">
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
						{t("q:settings.maps.neutral")}
					</span>
				)}
			</Radio>
			<Radio value="PREFER" aria-label="Prefer the mode">
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
						{t("q:settings.maps.prefer")}
					</span>
				)}
			</Radio>
		</RadioGroup>
	);
}
