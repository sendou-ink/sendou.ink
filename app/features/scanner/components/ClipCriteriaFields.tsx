/** The clip criteria's chip rows (min splats, then a length cap per splat count), shared by the montage and a scanned VoD. */
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import {
	CLIP_CRITERIA_KILL_COUNTS,
	CLIP_CRITERIA_MAX_SECONDS_OPTIONS,
	type ClipCriteria,
	maxSecondsFor,
} from "../core/clips/criteria";
import styles from "./ClipCriteriaFields.module.css";

export function ClipCriteriaFields({
	idPrefix,
	criteria,
	onChange,
}: {
	/** keeps the radio groups' names apart from other pickers on the page */
	idPrefix: string;
	criteria: ClipCriteria;
	onChange: (patch: Partial<ClipCriteria>) => void;
}) {
	return (
		<>
			<span className={styles.criterion}>
				<span className={styles.criterionLabel}>Min splats</span>
				<SendouChipRadioGroup>
					{CLIP_CRITERIA_KILL_COUNTS.map((kills) => (
						<SendouChipRadio
							key={kills}
							name={`${idPrefix}-min-kills`}
							value={String(kills)}
							checked={criteria.minKills === kills}
							onChange={() => onChange({ minKills: kills })}
						>
							{kills}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			</span>
			{CLIP_CRITERIA_KILL_COUNTS.filter(
				(kills) => kills >= criteria.minKills,
			).map((kills) => (
				<span key={kills} className={styles.criterion}>
					<span className={styles.criterionLabel}>
						{kills === CLIP_CRITERIA_KILL_COUNTS.at(-1) ? `${kills}+` : kills}{" "}
						splats, max
					</span>
					<SendouChipRadioGroup>
						{CLIP_CRITERIA_MAX_SECONDS_OPTIONS.map((seconds) => (
							<SendouChipRadio
								key={seconds}
								name={`${idPrefix}-max-seconds-${kills}`}
								value={String(seconds)}
								checked={maxSecondsFor(criteria, kills) === seconds}
								onChange={() =>
									onChange({
										maxSecondsByKills: {
											...criteria.maxSecondsByKills,
											[kills]: seconds,
										},
									})
								}
							>
								{seconds}s
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				</span>
			))}
		</>
	);
}
