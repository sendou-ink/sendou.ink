import clsx from "clsx";
import { Check } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useWebHaptics } from "web-haptics/react";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouTabPanel } from "../elements/Tabs";
import { ModeImage, StageImage } from "../Image";
import styles from "./MatchActionTab.module.css";
import { TAB_KEYS } from "./MatchTabs";
import {
	MatchTimeline,
	type MatchTimelineProps,
	type TimelineMap,
} from "./MatchTimeline";
import { WeaponReporter, type WeaponReporterProps } from "./WeaponReporter";

const LONG_TEAM_NAME_THRESHOLD = 16;

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
	ownTeamId: number | null;
	stageId: StageId;
	mode: ModeShort;
	withPoints: boolean;
	onSubmit?: (data: { winnerId: number; points?: [number, number] }) => void;
	isSubmitting?: boolean;
	setEnding?: SetEndingData;
	actionButtons?: React.ReactNode;
	weaponReport?: WeaponReporterProps;
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
	weaponReport,
}: MatchActionTabProps) {
	const { t } = useTranslation(["q", "game-misc", "common"]);
	const [winnerId, setWinnerId] = useState<number | null>(null);
	const [isKo, setIsKo] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const { trigger } = useWebHaptics();

	const canSubmit = winnerId !== null;

	const isOnTeam =
		ownTeamId != null &&
		(teams[0].id === ownTeamId || teams[1].id === ownTeamId);

	const submit = () => {
		if (winnerId === null) return;
		const submitPoints: [number, number] | undefined = withPoints
			? isKo
				? winnerId === teams[0].id
					? [100, 0]
					: [0, 100]
				: [0, 0]
			: undefined;
		onSubmit?.({ winnerId, points: submitPoints });
	};

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
					isSubmitting={isSubmitting}
					onBack={() => setConfirming(false)}
					onConfirm={submit}
				/>
			) : (
				<div className={clsx(styles.root, { [styles.withPoints]: withPoints })}>
					<div className={styles.title}>{t("q:match.action.selectWinner")}</div>
					{actionButtons ? (
						<div className={styles.actionButtons}>{actionButtons}</div>
					) : null}

					<RadioGroup
						value={winnerId !== null ? String(winnerId) : null}
						onChange={(value) => {
							const selectedId = Number(value);
							setWinnerId(selectedId);

							const isEnemySelection = isOnTeam && selectedId !== ownTeamId;
							if (isEnemySelection) {
								trigger([
									{ duration: 40, intensity: 0.7 },
									{ delay: 40, duration: 40, intensity: 0.7 },
									{ delay: 40, duration: 40, intensity: 0.9 },
									{ delay: 40, duration: 50, intensity: 0.6 },
								]);
							} else {
								trigger([
									{ duration: 30 },
									{ delay: 60, duration: 40, intensity: 1 },
								]);
							}
						}}
						isDisabled={isSubmitting}
						aria-label={t("q:match.action.selectWinner")}
						className={styles.selectionRow}
					>
						<TeamRadioOption
							team={teams[0]}
							isOwnTeam={teams[0].id === ownTeamId}
							hideLabel={ownTeamId == null}
							className={styles.alpha}
							testId="winner-radio-1"
						/>
						<StageImage
							stageId={stageId}
							width={90}
							className={styles.stageImage}
							containerClassName={styles.stageImageWrapper}
						/>
						<div className={styles.stageLabel}>
							<ModeImage mode={mode} size={14} />
							<span>{shortStageName(t(`game-misc:STAGE_${stageId}`))}</span>
						</div>
						<TeamRadioOption
							team={teams[1]}
							isOwnTeam={teams[1].id === ownTeamId}
							hideLabel={ownTeamId == null}
							className={clsx(styles.bravo)}
							testId="winner-radio-2"
						/>
					</RadioGroup>

					{withPoints ? (
						<div className={styles.ko}>
							<label className={styles.koLabel}>
								<input
									type="checkbox"
									checked={isKo}
									onChange={(e) => setIsKo(e.target.checked)}
									data-testid="ko-checkbox"
								/>
								{t("q:match.action.ko")}
							</label>
						</div>
					) : null}

					<SendouButton
						variant="primary"
						isDisabled={!canSubmit || isSubmitting}
						onPress={() => {
							if (winnerId === null) return;
							if (setEnding?.setEndingTeamIds.includes(winnerId)) {
								setConfirming(true);
							} else {
								submit();
							}
						}}
						className={styles.submit}
						testId="report-score-button"
					>
						{t("common:actions.submit")}
					</SendouButton>
				</div>
			)}
			{weaponReport ? <WeaponReporter {...weaponReport} /> : null}
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
				: [0, 0]
			: undefined,
	};

	const updatedScore = {
		alpha: setEnding.score.alpha + (winnerSide === "ALPHA" ? 1 : 0),
		bravo: setEnding.score.bravo + (winnerSide === "BRAVO" ? 1 : 0),
	};

	return (
		<div className={styles.confirmationRoot}>
			<div className={styles.confirmationMessage}>
				{t("q:match.action.confirmSetEnding")}
			</div>
			<MatchTimeline
				teams={setEnding.teams}
				score={updatedScore}
				maps={[...setEnding.maps, newMap]}
			/>
			<div className={styles.confirmationButtons}>
				<SendouButton
					variant="primary"
					isDisabled={isSubmitting}
					onPress={onConfirm}
					testId="confirm-set-end-button"
				>
					{t("common:actions.confirm")}
				</SendouButton>
				<SendouButton variant="outlined" onPress={onBack}>
					{t("common:actions.back")}
				</SendouButton>
			</div>
		</div>
	);
}

function TeamRadioOption({
	team,
	isOwnTeam,
	hideLabel,
	className,
	testId,
}: {
	team: ActionTabTeam;
	isOwnTeam: boolean;
	hideLabel?: boolean;
	className?: string;
	testId?: string;
}) {
	const { t } = useTranslation(["q"]);

	const isLongName = team.name.length > LONG_TEAM_NAME_THRESHOLD;

	return (
		<Radio
			value={String(team.id)}
			aria-label={team.name}
			className={clsx(styles.teamRadioContainer, className)}
			data-testid={testId}
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
							<span
								className={clsx(styles.teamName, {
									[styles.teamNameLong]: isLongName,
								})}
							>
								{team.name}
							</span>
							{hideLabel ? null : (
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
							)}
						</span>
					</span>
				</span>
			)}
		</Radio>
	);
}
