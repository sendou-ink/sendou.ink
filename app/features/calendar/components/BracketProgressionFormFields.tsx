import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { InfoPopover } from "~/components/InfoPopover";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as Swiss from "~/features/tournament-bracket/core/engine/swiss/team-status";
import { FormField } from "~/form/FormField";
import { useFormFieldContext } from "~/form/SendouForm";
import type { ArrayItemRenderContext } from "~/form/types";
import {
	type BracketFormValue,
	newFollowUpProgressionEntry,
	type ProgressionFormValue,
	sourceBracketHasEarlyAdvance,
} from "../calendar-progression-form";
import styles from "./BracketProgressionFormFields.module.css";

const DEFAULT_ADVANCE_THRESHOLD = "3";

export function BracketProgressionFormFields({
	isInvitational,
	disabledBracketIdxs = [],
	isTournamentInProgress = false,
}: {
	isInvitational: boolean;
	/** Idxs of brackets that have already started and can no longer be edited or deleted. */
	disabledBracketIdxs?: number[];
	/** When the tournament is in progress, which brackets are starting brackets can no longer be changed. */
	isTournamentInProgress?: boolean;
}) {
	const { values, setValue } = useFormFieldContext();
	const brackets = (values.brackets ?? []) as BracketFormValue[];
	const progression = (values.progression ?? []) as ProgressionFormValue[];

	// the array field's own add/remove buttons only report the new value, so the
	// removed bracket is located by reference diffing against the previous value
	const handleBracketsChanged = (newValue: unknown) => {
		const newBrackets = newValue as BracketFormValue[];

		if (newBrackets.length > progression.length) {
			setValue("progression", [
				...progression,
				...Array.from(
					{ length: newBrackets.length - progression.length },
					newFollowUpProgressionEntry,
				),
			]);
			return;
		}

		if (newBrackets.length < progression.length) {
			const removedIdx = brackets.findIndex(
				(bracket, idx) => newBrackets[idx] !== bracket,
			);
			setValue(
				"progression",
				progressionAfterBracketDelete(
					progression,
					removedIdx === -1 ? progression.length - 1 : removedIdx,
				).slice(0, Math.max(newBrackets.length, 1)),
			);
		}
	};

	return (
		<>
			<FormField
				name="brackets"
				canRemoveItem={(_, idx) =>
					idx !== 0 && !disabledBracketIdxs.includes(idx)
				}
				onValueChange={handleBracketsChanged}
			>
				{(renderContext: ArrayItemRenderContext) => (
					<BracketFields
						renderContext={renderContext}
						isDisabled={disabledBracketIdxs.includes(renderContext.index)}
					/>
				)}
			</FormField>
			{brackets.length > 1 ? (
				<FormField name="progression" canRemoveItem={() => false}>
					{(renderContext: ArrayItemRenderContext) => (
						<ProgressionEntryFields
							renderContext={renderContext}
							isInvitational={isInvitational}
							isDisabled={disabledBracketIdxs.includes(renderContext.index)}
							isSourceLocked={
								isTournamentInProgress ||
								disabledBracketIdxs.includes(renderContext.index)
							}
						/>
					)}
				</FormField>
			) : null}
		</>
	);
}

function BracketFields({
	renderContext,
	isDisabled,
}: {
	renderContext: ArrayItemRenderContext;
	isDisabled: boolean;
}) {
	const { t } = useTranslation(["forms"]);
	const { index, itemName, values, formValues, setItemField } = renderContext;
	const bracket = values as unknown as BracketFormValue;
	const progression = (formValues.progression ?? []) as ProgressionFormValue[];

	const isFollowUp = index > 0 && progression[index]?.source === "BRACKET";

	return (
		<div className="stack md items-start">
			<FormField name={`${itemName}.name`} disabled={isDisabled} />
			<FormField name={`${itemName}.type`} disabled={isDisabled} />

			{bracket.type === "single_elimination" ? (
				<FormField name={`${itemName}.thirdPlaceMatch`} disabled={isDisabled} />
			) : null}

			{bracket.type === "round_robin" ? (
				<FormField
					name={`${itemName}.teamsPerGroup`}
					disabled={isDisabled}
					options={(!isFollowUp && bracket.hasAbDivisions
						? TOURNAMENT.RR_AB_DIVISIONS_TEAMS_PER_GROUP_OPTIONS
						: TOURNAMENT.RR_TEAMS_PER_GROUP_OPTIONS
					).map((count) => ({ value: String(count), label: String(count) }))}
				/>
			) : null}

			{bracket.type === "round_robin" && !isFollowUp ? (
				<FormField
					name={`${itemName}.hasAbDivisions`}
					disabled={isDisabled}
					onValueChange={(isSelected) => {
						const teamsPerGroup = Number(bracket.teamsPerGroup);
						const maxWithoutAb = Math.max(
							...TOURNAMENT.RR_TEAMS_PER_GROUP_OPTIONS,
						);

						if (isSelected && teamsPerGroup % 2 !== 0) {
							setItemField("teamsPerGroup", String(teamsPerGroup + 1));
						} else if (!isSelected && teamsPerGroup > maxWithoutAb) {
							setItemField("teamsPerGroup", String(maxWithoutAb));
						}
					}}
				/>
			) : null}

			{bracket.type === "swiss" ? (
				<>
					<FormField name={`${itemName}.groupCount`} disabled={isDisabled} />
					<FormField
						name={`${itemName}.roundCount`}
						disabled={isDisabled}
						onValueChange={(newRoundCount) => {
							if (!bracket.earlyAdvance) return;
							if (
								!Swiss.isValidAdvanceThreshold({
									roundCount: Number(newRoundCount),
									advanceThreshold: Number(bracket.advanceThreshold),
								})
							) {
								setItemField("advanceThreshold", DEFAULT_ADVANCE_THRESHOLD);
							}
						}}
					/>
					<FormField name={`${itemName}.earlyAdvance`} disabled={isDisabled} />
				</>
			) : null}

			{bracket.type === "swiss" && bracket.earlyAdvance ? (
				<div>
					<FormField
						name={`${itemName}.advanceThreshold`}
						disabled={isDisabled}
						options={Swiss.validAdvanceThresholdOptions({
							roundCount: Number(bracket.roundCount),
						}).map((threshold) => ({
							value: String(threshold),
							label: String(threshold),
						}))}
					/>
					<FormMessage type="info">
						{t("forms:bottomTexts.advanceThresholdMaxLosses", {
							maxLosses:
								Swiss.eliminationThreshold({
									roundCount: Number(bracket.roundCount),
									advanceThreshold: Number(bracket.advanceThreshold),
								}) - 1,
						})}
					</FormMessage>
				</div>
			) : null}

			{isFollowUp ? (
				<>
					<FormField name={`${itemName}.startTime`} disabled={isDisabled} />
					<FormField
						name={`${itemName}.requiresCheckIn`}
						disabled={isDisabled}
					/>
				</>
			) : null}
		</div>
	);
}

function ProgressionEntryFields({
	renderContext,
	isInvitational,
	isDisabled,
	isSourceLocked,
}: {
	renderContext: ArrayItemRenderContext;
	isInvitational: boolean;
	isDisabled: boolean;
	isSourceLocked: boolean;
}) {
	const { t } = useTranslation(["forms"]);
	const { index, itemName, values, formValues } = renderContext;
	const entry = values as unknown as ProgressionFormValue;
	const brackets = (formValues.brackets ?? []) as BracketFormValue[];

	const isFirstBracket = index === 0;

	const sourceBracketOptions = brackets.flatMap((bracket, bracketIdx) =>
		bracketIdx === index || !bracket.name
			? []
			: [{ value: String(bracketIdx), label: bracket.name }],
	);

	return (
		<div className="stack md items-start">
			{brackets[index]?.name ? (
				<div className="text-sm font-semi-bold">{brackets[index].name}</div>
			) : null}
			<FormField
				name={`${itemName}.source`}
				disabled={isFirstBracket || isSourceLocked}
			/>
			{!isFirstBracket && entry.source === "BRACKET" ? (
				<>
					<FormField
						name={`${itemName}.sourceBracketIdx`}
						options={sourceBracketOptions}
						disabled={isDisabled}
					/>
					{!sourceBracketHasEarlyAdvance(brackets, entry) ? (
						<FormField
							name={`${itemName}.placements`}
							disabled={isDisabled}
							labelPopover={<PlacementsSyntaxPopover />}
						/>
					) : null}
				</>
			) : (
				<FormMessage type="info">
					{isInvitational
						? t("forms:progression.addedByOrganizer")
						: t("forms:progression.joinFromSignUp")}
				</FormMessage>
			)}
		</div>
	);
}

function PlacementsSyntaxPopover() {
	return (
		<InfoPopover tiny>
			<div>
				Which teams of the source bracket move to this bracket. Examples:
			</div>
			<div className={styles.syntaxExample}>
				<code className={styles.syntaxCode}>1,2,3</code>
				<span className={styles.syntaxExplanation}>Places 1, 2 and 3</span>
			</div>
			<div className={styles.syntaxExample}>
				<code className={styles.syntaxCode}>1-4</code>
				<span className={styles.syntaxExplanation}>Places 1 to 4</span>
			</div>
			<div className={styles.syntaxExample}>
				<code className={styles.syntaxCode}>5+</code>
				<span className={styles.syntaxExplanation}>
					Place 5 and every place after
				</span>
			</div>
			<div className={styles.syntaxExample}>
				<code className={styles.syntaxCode}>-1,-2</code>
				<span className={styles.syntaxExplanation}>
					Teams eliminated in (losers) rounds 1 & 2 (elimination brackets only)
				</span>
			</div>
		</InfoPopover>
	);
}

function progressionAfterBracketDelete(
	progression: ProgressionFormValue[],
	deletedIdx: number,
): ProgressionFormValue[] {
	return progression
		.filter((_, idx) => idx !== deletedIdx)
		.map((entry) => {
			const sourceIdx = Number(entry.sourceBracketIdx);

			if (sourceIdx === deletedIdx) {
				return { ...entry, sourceBracketIdx: "0" };
			}
			if (sourceIdx > deletedIdx) {
				return { ...entry, sourceBracketIdx: String(sourceIdx - 1) };
			}
			return entry;
		});
}
