import * as React from "react";
import { useTranslation } from "react-i18next";
import type { SkippableRound } from "~/db/tables-json";
import * as SkippedRounds from "~/features/tournament-bracket/core/SkippedRounds";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import styles from "./RoundsPlayedChecklist.module.css";

/**
 * The named rounds of an elimination bracket, unchecking one leaves it (and every round fed by it) unplayed.
 * Checking a round that is unplayed because of another one plays that one too.
 */
export function RoundsPlayedChecklist({
	name,
	type,
	skipped,
	onChange,
	error,
	disabled,
}: {
	name: string;
	type: "single_elimination" | "double_elimination";
	skipped: SkippableRound[];
	onChange: (skipped: SkippableRound[]) => void;
	error?: string;
	disabled?: boolean;
}) {
	const { t } = useTranslation(["forms"]);
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label="forms:labels.roundsPlayed"
			error={error}
			bottomText="forms:bottomTexts.roundsPlayed"
		>
			<div className="stack sm items-start">
				{SkippedRounds.SKIPPABLE_ROUNDS[type].map((round) => {
					const isPlayed = !skipped.includes(round);
					const skippedPrerequisite = SkippedRounds.prerequisitesOf(round).find(
						(prerequisite) => skipped.includes(prerequisite),
					);

					return (
						<div key={round} className={styles.round}>
							<div className="stack horizontal sm items-center">
								<input
									type="checkbox"
									id={`${id}-${round}`}
									checked={isPlayed}
									disabled={disabled}
									onChange={(event) =>
										onChange(
											event.target.checked
												? SkippedRounds.withPlayed(type, skipped, round)
												: SkippedRounds.withSkipped(type, skipped, round),
										)
									}
									data-testid={`round-played-${round}`}
								/>
								<label htmlFor={`${id}-${round}`} className="mb-0">
									{t(`forms:options.skippableRound.${round}`)}
								</label>
							</div>
							{skippedPrerequisite ? (
								<div className={styles.lockedHint}>
									{t("forms:bottomTexts.roundNotPlayedWithout", {
										round: t(
											`forms:options.skippableRound.${skippedPrerequisite}`,
										),
									})}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</FormFieldWrapper>
	);
}
