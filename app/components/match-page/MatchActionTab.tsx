import clsx from "clsx";
import { Check } from "lucide-react";
import type * as React from "react";
import { useId, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { SendouTabPanel } from "../elements/Tabs";
import { StageImage } from "../Image";
import { Label } from "../Label";
import styles from "./MatchActionTab.module.css";
import { TAB_KEYS } from "./MatchTabs";
import {
	MatchTimeline,
	type MatchTimelineProps,
	type TimelineMap,
} from "./MatchTimeline";

interface ActionTabTeam {
	id: number;
	name: string;
	avatar?: string;
}

interface SetEndingData extends MatchTimelineProps {
	currentRosters: { alpha: CommonUser[]; bravo: CommonUser[] };
	setEndingTeamIds: number[];
}

interface MatchActionTabProps {
	teams: [ActionTabTeam, ActionTabTeam];
	ownTeamId: number;
	stageId: StageId;
	mode: ModeShort;
	withPoints: boolean;
	onSubmit?: (winnerId: number) => void;
	isSubmitting?: boolean;
	setEnding?: SetEndingData;
	actionButtons?: React.ReactNode;
}

export function MatchActionTab({
	teams,
	ownTeamId,
	stageId,
	mode,
	withPoints,
	onSubmit,
	isSubmitting,
	setEnding,
	actionButtons,
}: MatchActionTabProps) {
	const { t } = useTranslation(["q", "game-misc", "common"]);
	const [winnerId, setWinnerId] = useState<number | null>(null);
	const [isKo, setIsKo] = useState(false);
	const [points, setPoints] = useState<[number, number]>([0, 0]);
	const [confirming, setConfirming] = useState(false);

	const pointsValid = !withPoints || isKo || points[0] > 0 || points[1] > 0;
	const canSubmit = winnerId !== null && pointsValid;

	// xxx: add haptics
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			{confirming && winnerId !== null && setEnding ? (
				<SetEndingConfirmation
					setEnding={setEnding}
					stageId={stageId}
					mode={mode}
					winnerId={winnerId}
					teams={teams}
					withPoints={withPoints}
					isKo={isKo}
					points={points}
					isSubmitting={isSubmitting}
					onBack={() => setConfirming(false)}
					onConfirm={() => onSubmit?.(winnerId)}
				/>
			) : (
				<div className={styles.root}>
					<div className={styles.title}>
						{t("q:match.action.selectWinner")}{" "}
						{t(`game-misc:MODE_SHORT_${mode}`)}{" "}
						{t(`game-misc:STAGE_${stageId}`)}
					</div>
					{actionButtons ? (
						<div className={styles.actionButtons}>{actionButtons}</div>
					) : null}

					<RadioGroup
						value={winnerId !== null ? String(winnerId) : undefined}
						onChange={(value) => setWinnerId(Number(value))}
						aria-label={t("q:match.action.selectWinner")}
						className={styles.selectionRow}
					>
						<TeamRadioOption
							team={teams[0]}
							isOwnTeam={teams[0].id === ownTeamId}
							className={styles.alpha}
						/>
						<div className={styles.stageImageContainer}>
							<StageImage
								stageId={stageId}
								width={90}
								className={styles.stageImage}
							/>
						</div>
						<TeamRadioOption
							team={teams[1]}
							isOwnTeam={teams[1].id === ownTeamId}
							className={clsx(styles.bravo)}
						/>
					</RadioGroup>

					{withPoints ? (
						<>
							<PointsInput
								value={points[0]}
								onChange={(value) => setPoints([value, points[1]])}
								hidden={isKo}
								className={styles.pointsAlpha}
							/>
							<div className={styles.ko}>
								<label className={styles.koLabel}>
									<input
										type="checkbox"
										checked={isKo}
										onChange={(e) => setIsKo(e.target.checked)}
									/>
									{t("q:match.action.ko")}
								</label>
								<SendouPopover
									trigger={
										<SendouButton variant="minimal" className={styles.koHelp}>
											{t("q:match.action.koHelp")}
										</SendouButton>
									}
								>
									TODO
								</SendouPopover>
							</div>
							<PointsInput
								value={points[1]}
								onChange={(value) => setPoints([points[0], value])}
								hidden={isKo}
								className={styles.pointsBravo}
							/>
						</>
					) : null}

					<SendouButton
						variant="primary"
						isDisabled={!canSubmit || isSubmitting}
						onPress={() => {
							if (winnerId === null) return;
							if (setEnding?.setEndingTeamIds.includes(winnerId)) {
								setConfirming(true);
							} else {
								onSubmit?.(winnerId);
							}
						}}
						className={styles.submit}
					>
						{t("common:actions.submit")}
					</SendouButton>
				</div>
			)}
		</SendouTabPanel>
	);
}

function SetEndingConfirmation({
	setEnding,
	stageId,
	mode,
	winnerId,
	teams,
	withPoints,
	isKo,
	points,
	isSubmitting,
	onBack,
	onConfirm,
}: {
	setEnding: SetEndingData;
	stageId: StageId;
	mode: ModeShort;
	winnerId: number;
	teams: [ActionTabTeam, ActionTabTeam];
	withPoints: boolean;
	isKo: boolean;
	points: [number, number];
	isSubmitting?: boolean;
	onBack: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation(["q", "common"]);

	const winnerSide = winnerId === teams[0].id ? "ALPHA" : "BRAVO";

	const newMap: TimelineMap = {
		stageId,
		mode,
		timestamp: Date.now(),
		winner: winnerSide,
		rosters: setEnding.currentRosters,
		points: withPoints
			? isKo
				? [winnerSide === "ALPHA" ? 100 : 0, winnerSide === "BRAVO" ? 100 : 0]
				: points
			: undefined,
	};

	const updatedScore = {
		alpha: setEnding.score.alpha + (winnerSide === "ALPHA" ? 1 : 0),
		bravo: setEnding.score.bravo + (winnerSide === "BRAVO" ? 1 : 0),
	};

	return (
		<div className={styles.confirmationRoot}>
			<MatchTimeline
				teams={setEnding.teams}
				score={updatedScore}
				maps={[...setEnding.maps, newMap]}
			/>
			<div className={styles.confirmationMessage}>
				{t("q:match.action.confirmSetEnding")}
			</div>
			<div className={styles.confirmationButtons}>
				<SendouButton variant="outlined" onPress={onBack}>
					{t("common:actions.back")}
				</SendouButton>
				<SendouButton
					variant="primary"
					isDisabled={isSubmitting}
					onPress={onConfirm}
				>
					{t("common:actions.confirm")}
				</SendouButton>
			</div>
		</div>
	);
}

function TeamRadioOption({
	team,
	isOwnTeam,
	className,
}: {
	team: ActionTabTeam;
	isOwnTeam: boolean;
	className?: string;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<Radio
			value={String(team.id)}
			aria-label={team.name}
			className={clsx(styles.teamRadioContainer, className)}
		>
			{({ isSelected, isFocusVisible }) => (
				<span
					className={clsx(styles.teamRadio, {
						[styles.selected]: isSelected,
						[styles.focusVisible]: isFocusVisible,
					})}
				>
					<span
						className={clsx(styles.checkCircle, {
							[styles.checkCircleSelected]: isSelected,
						})}
					>
						{isSelected ? <Check size={14} /> : null}
					</span>
					<span className={styles.teamAvatarInfo}>
						<Avatar url={team.avatar} identiconInput={team.name} size="xxs" />
						<span className={styles.teamInfo}>
							<span className={styles.teamName}>{team.name}</span>
							<span
								className={clsx(styles.teamLabel, {
									[styles.myTeamLabel]: isOwnTeam,
									[styles.opponentLabel]: !isOwnTeam,
								})}
							>
								{isOwnTeam
									? t("q:match.action.myTeam")
									: t("q:match.action.opponent")}
							</span>
						</span>
					</span>
				</span>
			)}
		</Radio>
	);
}

function PointsInput({
	value,
	onChange,
	hidden,
	className,
}: {
	value: number;
	onChange: (value: number) => void;
	hidden: boolean;
	className?: string;
}) {
	const { t } = useTranslation(["q"]);
	const [focused, setFocused] = useState(false);
	const id = useId();

	return (
		<div className={clsx("stack xs", className, { invisible: hidden })}>
			<Label htmlFor={id} spaced={false}>
				{t("q:match.action.points")}
			</Label>
			<input
				className={styles.pointsInput}
				id={id}
				type="number"
				min={0}
				max={99}
				value={focused && !value ? "" : String(value)}
				onChange={(e) => onChange(Number(e.target.value))}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				pattern="[0-9]*"
				inputMode="numeric"
			/>
		</div>
	);
}
