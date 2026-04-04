import clsx from "clsx";
import { differenceInMinutes } from "date-fns";
import type { TFunction } from "i18next";
import { Check, MousePointerClick, X } from "lucide-react";
import type { JSX } from "react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Image } from "~/components/Image";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import {
	isLeagueRoundLocked,
	resolveLeagueRoundStartDate,
} from "~/features/tournament/tournament-utils";
import { useHydrated } from "~/hooks/useHydrated";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { StageId } from "~/modules/in-game-lists/types";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import type { Unpacked } from "~/utils/types";
import {
	modeImageUrl,
	specialWeaponImageUrl,
	stageImageUrl,
} from "~/utils/urls";
import type { Bracket } from "../core/Bracket";
import * as Deadline from "../core/Deadline";
import * as PickBan from "../core/PickBan";
import type { TournamentDataTeam } from "../core/Tournament.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "../tournament-bracket.module.css";
import {
	groupNumberToLetters,
	mapCountPlayedInSetWithCertainty,
	matchIsLocked,
	pickInfoText,
	resolveHostingTeam,
	resolveRoomPass,
	tournamentTeamToActiveRosterUserIds,
} from "../tournament-bracket-utils";
import { DeadlineInfoPopover } from "./DeadlineInfoPopover";
import { MatchActions } from "./MatchActions";
import { MatchMapInfo } from "./MatchMapInfo";
import { MatchRosters } from "./MatchRosters";
import { MatchTimer } from "./MatchTimer";

export type Result = Unpacked<
	SerializeFrom<TournamentMatchLoaderData>["results"]
>;

export function StartedMatch({
	teams,
	currentStageWithMode,
	selectedResultIndex,
	setSelectedResultIndex,
	result,
	type,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
	result?: Result;
	currentStageWithMode?: TournamentMapListMap;
	selectedResultIndex?: number;
	// if this is set it means the component is being used in presentation manner
	setSelectedResultIndex?: (index: number) => void;
	type: "EDIT" | "OTHER";
}) {
	const { t } = useTranslation(["tournament"]);
	const isHydrated = useHydrated();
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();

	const scoreOne = data.match.opponentOne?.score ?? 0;
	const scoreTwo = data.match.opponentTwo?.score ?? 0;

	const currentPosition = scoreOne + scoreTwo;

	const presentational = Boolean(setSelectedResultIndex);

	const showFullInfos = !presentational && type === "EDIT";

	const isMemberOfTeamParticipating = data.match.players.some(
		(p) => p.id === user?.id,
	);

	const waitingForPreviousMatch = data.match.status === 0;

	const hostingTeamId = resolveHostingTeam(teams).id;
	const poolCode = React.useMemo(() => {
		const match = tournament.brackets
			.flatMap((b) => b.data.match)
			.find((m) => m.id === data.match.id);

		const hasRoundRobin = tournament.brackets.some(
			(b) => b.type === "round_robin",
		);
		const bracketIdx = tournament.brackets.findIndex((b) =>
			b.data.match.some((m) => m.id === data.match.id),
		);
		const bracket = tournament.brackets[bracketIdx] as Bracket | undefined;
		const group = tournament.brackets
			.flatMap((b) => b.data.group)
			.find((group) => group.id === match?.group_id);
		return tournament.resolvePoolCode({
			hostingTeamId,
			groupLetters:
				group && bracket?.type === "round_robin"
					? groupNumberToLetters(group.number)
					: undefined,
			bracketNumber:
				hasRoundRobin && bracket?.type !== "round_robin"
					? bracketIdx + 1
					: undefined,
		});
	}, [tournament, hostingTeamId, data.match.id]);

	const roundInfos = [
		showFullInfos ? (
			<React.Fragment key="hosts">
				{t("tournament:match.hosts", {
					teamName: resolveHostingTeam(teams).name,
				})}
			</React.Fragment>
		) : null,
		showFullInfos ? (
			<React.Fragment key="pass">
				{t("tournament:match.pass")}{" "}
				<span className="text-theme font-bold" data-testid="room-pass">
					{resolveRoomPass(hostingTeamId)}
				</span>
			</React.Fragment>
		) : null,
		showFullInfos ? (
			<span key="pool">
				{t("tournament:match.pool")} {poolCode.prefix}
				<span className="text-theme font-bold">{poolCode.suffix}</span>
			</span>
		) : null,
		<React.Fragment key="score">
			{data.match.roundMaps?.type === "PLAY_ALL"
				? t("tournament:match.score.playAll", {
						scoreOne,
						scoreTwo,
						bestOf: data.match.bestOf,
					})
				: t("tournament:match.score", {
						scoreOne,
						scoreTwo,
						bestOf: data.match.bestOf,
					})}
		</React.Fragment>,
		tournament.ctx.settings.enableNoScreenToggle &&
		typeof data.noScreen === "boolean" ? (
			<ScreenBanIcons key="screen-ban" banned={data.noScreen} />
		) : null,
	];

	return (
		<div className={styles.duringMatchActions}>
			<FancyStageBanner
				stage={currentStageWithMode}
				infos={roundInfos}
				teams={teams}
				matchIsLocked={matchIsLocked({
					matchId: data.match.id,
					scores: [scoreOne, scoreTwo],
					tournament,
				})}
				waitingForPreviousMatch={waitingForPreviousMatch}
			>
				{currentPosition > 0 &&
					!presentational &&
					type === "EDIT" &&
					(tournament.isOrganizer(user) || isMemberOfTeamParticipating) && (
						<Form method="post">
							<input
								type="hidden"
								name="position"
								value={currentPosition - 1}
							/>
							<div className={styles.stageBannerBottomBar}>
								<SubmitButton
									_action="UNDO_REPORT_SCORE"
									className={styles.stageBannerUndoButton}
									variant="destructive"
									size="miniscule"
									testId="undo-score-button"
								>
									{t("tournament:match.action.undoLastScore")}
								</SubmitButton>
							</div>
						</Form>
					)}
				{tournament.isOrganizer(user) &&
					tournament.matchCanBeReopened(data.match.id) &&
					presentational && (
						<Form method="post">
							<div className={styles.stageBannerBottomBar}>
								<SubmitButton
									_action="REOPEN_MATCH"
									className={styles.stageBannerUndoButton}
									variant="destructive"
									size="miniscule"
									testId="reopen-match-button"
								>
									{t("tournament:match.action.reopenMatch")}
								</SubmitButton>
							</div>
						</Form>
					)}
				{tournament.isOrganizer(user) &&
				!data.matchIsOver &&
				data.match.startedAt &&
				Deadline.matchStatus({
					elapsedMinutes: differenceInMinutes(
						new Date(),
						databaseTimestampToDate(data.match.startedAt),
					),
					gamesCompleted: scoreOne + scoreTwo,
					maxGamesCount: data.match.bestOf,
				}) === "error" ? (
					<EndSetPopover teams={teams} />
				) : null}
			</FancyStageBanner>
			<ModeProgressIndicator
				scores={[scoreOne, scoreTwo]}
				bestOf={data.match.bestOf}
				selectedResultIndex={selectedResultIndex}
				setSelectedResultIndex={setSelectedResultIndex}
			/>
			{!waitingForPreviousMatch && (type === "EDIT" || presentational) ? (
				<StartedMatchTabs
					presentational={presentational}
					scores={[scoreOne, scoreTwo]}
					teams={teams}
					result={result}
				/>
			) : null}
			{result ? (
				<div
					className={clsx("text-center text-xs text-lighter", {
						invisible: !isHydrated,
					})}
					data-testid="report-timestamp"
				>
					{isHydrated
						? databaseTimestampToDate(result.createdAt).toLocaleString()
						: "t"}
				</div>
			) : null}
		</div>
	);
}

function FancyStageBanner({
	stage,
	infos,
	children,
	teams,
	matchIsLocked,
	waitingForPreviousMatch,
}: {
	stage?: TournamentMapListMap;
	infos?: (JSX.Element | null)[];
	children?: React.ReactNode;
	teams: [TournamentDataTeam, TournamentDataTeam];
	matchIsLocked: boolean;
	waitingForPreviousMatch: boolean;
}) {
	const user = useUser();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const { t } = useTranslation(["game-misc", "tournament"]);
	const tournament = useTournament();

	const gamesCompleted = data.results.length;

	const stageNameToBannerImageUrl = (stageId: StageId) => {
		return `${stageImageUrl(stageId)}.avif`;
	};

	const turnOfResult = (() => {
		if (
			!data.match.roundMaps ||
			!data.match.opponentOne?.id ||
			!data.match.opponentTwo?.id
		) {
			return null;
		}

		return PickBan.turnOf({
			results: data.results,
			maps: data.match.roundMaps,
			teams: [
				{
					id: data.match.opponentOne.id,
					seed: tournament.teamById(data.match.opponentOne.id)!.seed,
				},
				{
					id: data.match.opponentTwo.id,
					seed: tournament.teamById(data.match.opponentTwo.id)!.seed,
				},
			],
			mapList: data.mapList,
			pickBanEventCount: data.pickBanEventCount,
		});
	})();

	const banPickingTeam = () => {
		return turnOfResult
			? teams.find((t) => t.id === turnOfResult.teamId)
			: null;
	};

	const style = {
		"--_tournament-bg-url": stage
			? `url("${stageNameToBannerImageUrl(stage.stageId)}")`
			: undefined,
	};

	const inBanPhase =
		!data.matchIsOver &&
		data.match.roundMaps?.pickBan === "BAN_2" &&
		data.mapList &&
		data.mapList.filter((m) => m.bannedByTournamentTeamId).length < 2;

	const waitingForActiveRosterSelectionFor = (() => {
		if (data.results.length > 0) return null;

		const teamOneMissing = !tournamentTeamToActiveRosterUserIds(
			teams[0],
			tournament.minMembersPerTeam,
		);
		const teamTwoMissing = !tournamentTeamToActiveRosterUserIds(
			teams[1],
			tournament.minMembersPerTeam,
		);

		if (teamOneMissing && teamTwoMissing) {
			return "BOTH";
		}

		if (teamOneMissing) {
			return teams[0].name;
		}

		if (teamTwoMissing) {
			return teams[1].name;
		}

		return null;
	})();

	const waitingForLeagueRoundToStart = isLeagueRoundLocked(
		tournament,
		data.match.roundId,
	);

	const noStageHeading = () => {
		if (data.match.roundMaps?.pickBan === "CUSTOM" && turnOfResult) {
			const stepCounter =
				turnOfResult.stepTotal && turnOfResult.stepTotal > 1
					? ` (${turnOfResult.stepCurrent}/${turnOfResult.stepTotal})`
					: "";

			switch (turnOfResult.action) {
				case "PICK":
					return t("tournament:pickBan.pickMap") + stepCounter;
				case "BAN":
					return t("tournament:pickBan.banMap") + stepCounter;
				case "MODE_PICK":
					return t("tournament:pickBan.pickMode") + stepCounter;
				case "MODE_BAN":
					return t("tournament:pickBan.banMode") + stepCounter;
				default:
					return t("tournament:pickBan.counterpick");
			}
		}
		return t("tournament:pickBan.counterpick");
	};

	return (
		<>
			{matchIsLocked ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">
							Match locked to be casted
						</div>
						<div>Please wait for staff to unlock</div>
					</div>
				</div>
			) : waitingForLeagueRoundToStart ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">
							Waiting for league round to start
						</div>
						<div>
							Round playable from{" "}
							{resolveLeagueRoundStartDate(
								tournament,
								data.match.roundId,
							)!.toLocaleDateString()}{" "}
							onwards
						</div>
					</div>
				</div>
			) : waitingForPreviousMatch ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">
							Previous match ongoing
						</div>
						<div>
							Match will be reportable when both teams are ready to play
						</div>
					</div>
				</div>
			) : waitingForActiveRosterSelectionFor ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div
							className="text-lg text-center font-bold"
							data-testid="active-roster-needed-text"
						>
							Active rosters need to be selected
						</div>
						<div>
							Waiting on{" "}
							{waitingForActiveRosterSelectionFor === "BOTH"
								? "both teams"
								: waitingForActiveRosterSelectionFor}
						</div>
					</div>
					{data.match.startedAt &&
					!tournament.isLeagueDivision &&
					(waitingForActiveRosterSelectionFor || !stage || inBanPhase) ? (
						<DeadlineInfoPopover
							startedAt={databaseTimestampToDate(data.match.startedAt)}
							bestOf={data.match.bestOf}
							gamesCompleted={gamesCompleted}
						/>
					) : null}
				</div>
			) : inBanPhase ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">Banning phase</div>
						<div>Waiting for {banPickingTeam()?.name}</div>
					</div>
				</div>
			) : !stage ? (
				<div className={styles.lockedBanner}>
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">
							{noStageHeading()}
						</div>
						<div>Waiting for {banPickingTeam()?.name}</div>
						{children}
					</div>
				</div>
			) : (
				<div
					className={clsx(styles.stageBanner, {
						rounded: !infos,
					})}
					style={style}
					data-testid="stage-banner"
				>
					<div className={styles.stageBannerTopBar}>
						<h4 className={styles.stageBannerTopBarHeader}>
							<Image path={modeImageUrl(stage.mode)} alt="" width={24} />
							<span className={styles.stageBannerTopBarMapTextSmall}>
								{t(`game-misc:MODE_SHORT_${stage.mode}`)}{" "}
								{t(`game-misc:STAGE_${stage.stageId}`)}
							</span>
							<span className={styles.stageBannerTopBarMapTextBig}>
								{t(`game-misc:MODE_LONG_${stage.mode}`)} on{" "}
								{t(`game-misc:STAGE_${stage.stageId}`)}
							</span>
						</h4>
						<h4>
							{pickInfoText({
								t: t as unknown as TFunction<["tournament"]>,
								teams,
								map: stage,
							})}
						</h4>
					</div>
					{data.match.startedAt &&
					!tournament.isLeagueDivision &&
					!data.matchIsOver ? (
						<DeadlineInfoPopover
							startedAt={databaseTimestampToDate(data.match.startedAt)}
							bestOf={data.match.bestOf}
							gamesCompleted={gamesCompleted}
						/>
					) : null}
					{children}
				</div>
			)}
			{(tournament.isOrganizer(user) ||
				teams.some((t) => t.members.some((m) => m.userId === user?.id))) &&
			!tournament.isLeagueDivision &&
			!matchIsLocked &&
			data.match.startedAt &&
			!data.matchIsOver ? (
				<MatchTimer
					startedAt={databaseTimestampToDate(data.match.startedAt)}
					bestOf={data.match.bestOf}
				/>
			) : null}
			{infos && (
				<div className={styles.infos}>
					{infos.filter(Boolean).map((info, i) => (
						<div key={i}>{info}</div>
					))}
				</div>
			)}
		</>
	);
}

function ModeProgressIndicator({
	scores,
	bestOf,
	selectedResultIndex,
	setSelectedResultIndex,
}: {
	scores: [number, number];
	bestOf: number;
	selectedResultIndex?: number;
	setSelectedResultIndex?: (index: number) => void;
}) {
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const { t } = useTranslation(["game-misc"]);

	const maxIndexThatWillBePlayedForSure =
		data.match.roundMaps?.type === "PLAY_ALL"
			? bestOf - 1
			: mapCountPlayedInSetWithCertainty({ bestOf, scores }) - 1;

	const indexWithBansConsider = (realIdx: number) => {
		let result = 0;

		for (const [idx, map] of (data.mapList ?? []).entries()) {
			if (idx === realIdx) {
				break;
			}

			if (map.bannedByTournamentTeamId) {
				continue;
			}

			result++;
		}

		return result;
	};

	// TODO: this should be button when we click on it
	return (
		<div className={styles.modeProgress}>
			<div className={styles.modeProgressInner}>
				{nullFilledArray(
					Math.max(data.mapList?.length ?? 0, data.match.roundMaps?.count ?? 0),
				).map((_, i) => {
					const map = data.mapList?.[i];

					const adjustedI = indexWithBansConsider(i);

					if (
						data.matchIsOver &&
						!data.results[adjustedI] &&
						!map?.bannedByTournamentTeamId
					) {
						return null;
					}

					if (!map?.mode) {
						return (
							<div key={i} className={styles.modeProgressImage}>
								<MousePointerClick />
							</div>
						);
					}

					if (map.bannedByTournamentTeamId) {
						const bannerTeamName = tournament.ctx.teams.find(
							(t) => t.id === map.bannedByTournamentTeamId,
						)?.name;

						return (
							<SendouPopover
								key={i}
								trigger={
									<SendouButton
										variant="minimal"
										size="small"
										className={styles.modeProgressImageBannedPopoverTrigger}
									>
										<Image
											containerClassName={clsx(
												styles.modeProgressImage,
												styles.modeProgressImageBanned,
											)}
											path={modeImageUrl(map.mode)}
											height={20}
											width={20}
											alt={t(`game-misc:MODE_LONG_${map.mode}`)}
											testId="mode-progress-banned"
										/>
									</SendouButton>
								}
							>
								<div className="text-center">
									{t(`game-misc:MODE_SHORT_${map.mode}`)}{" "}
									{t(`game-misc:STAGE_${map.stageId}`)}
								</div>
								<div className="text-xs text-lighter">
									Banned by {bannerTeamName}
								</div>
							</SendouPopover>
						);
					}

					return (
						<Image
							containerClassName={clsx(styles.modeProgressImage, {
								[styles.modeProgressImageNotable]:
									adjustedI <= maxIndexThatWillBePlayedForSure,
								[styles.modeProgressImageTeamOneWin]:
									data.results[adjustedI] &&
									data.results[adjustedI].winnerTeamId ===
										data.match.opponentOne?.id,
								[styles.modeProgressImageTeamTwoWin]:
									data.results[adjustedI] &&
									data.results[adjustedI].winnerTeamId ===
										data.match.opponentTwo?.id,
								[styles.modeProgressImageSelected]:
									adjustedI === selectedResultIndex,
								"cursor-pointer": Boolean(setSelectedResultIndex),
							})}
							key={i}
							path={modeImageUrl(map.mode)}
							height={20}
							width={20}
							alt={t(`game-misc:MODE_LONG_${map.mode}`)}
							title={t(`game-misc:MODE_LONG_${map.mode}`)}
							onClick={() => setSelectedResultIndex?.(adjustedI)}
							testId={`mode-progress-${map.mode}`}
						/>
					);
				})}
			</div>
		</div>
	);
}

function StartedMatchTabs({
	presentational,
	scores,
	teams,
	result,
}: {
	presentational?: boolean;
	scores: [number, number];
	teams: [TournamentDataTeam, TournamentDataTeam];
	result?: Result;
}) {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const isCustomFlow = data.match.roundMaps?.pickBan === "CUSTOM";
	const validTabs = isCustomFlow
		? ["rosters", "actions", "map-info"]
		: ["rosters", "actions"];
	const [selectedTabKey, setSelectedTabKey] = useSearchParamState({
		defaultValue: "rosters",
		name: "tab",
		revive: (value) => (validTabs.includes(value) ? value : null),
	});

	const currentPosition = scores[0] + scores[1];

	const matchActionsKey = () =>
		[
			data.match.id,
			tournamentTeamToActiveRosterUserIds(
				teams[0],
				tournament.minMembersPerTeam,
			),
			tournamentTeamToActiveRosterUserIds(
				teams[1],
				tournament.minMembersPerTeam,
			),
			result?.participants
				.map((p) => `${p.userId}-${p.tournamentTeamId}`)
				.join(","),
			result?.opponentOnePoints,
			result?.opponentTwoPoints,
			data.results.length,
		].join("-");

	return (
		<ActionSectionWrapper>
			<SendouTabs
				selectedKey={selectedTabKey}
				onSelectionChange={(key) => setSelectedTabKey(String(key))}
				className={styles.matchTabs}
			>
				<SendouTabList>
					<SendouTab id="rosters">Rosters</SendouTab>
					<SendouTab id="actions" data-testid="actions-tab">
						{presentational ? "Score" : "Actions"}
					</SendouTab>
					{isCustomFlow ? (
						<SendouTab id="map-info">
							{t("tournament:match.tab.mapInfo")}
						</SendouTab>
					) : null}
				</SendouTabList>

				<SendouTabPanel id="rosters">
					<MatchRosters teams={[teams[0].id, teams[1].id]} />
				</SendouTabPanel>

				<SendouTabPanel
					id="actions"
					shouldForceMount
					className={clsx({
						hidden: selectedTabKey !== "actions",
					})}
				>
					<MatchActions
						// Without the key prop when switching to another match the winnerId is remembered
						// which causes "No winning team matching the id" error.
						// In addition we want the active roster changing either by the user or by another user
						// to reset the state inside. We also want to clear the inputs when a result is submitted
						key={matchActionsKey()}
						scores={scores}
						teams={teams}
						position={currentPosition}
						result={result}
						presentational={
							!tournament.canReportScore({ matchId: data.match.id, user })
						}
					/>
				</SendouTabPanel>

				{isCustomFlow ? (
					<SendouTabPanel id="map-info">
						<MatchMapInfo teams={[teams[0].id, teams[1].id]} />
					</SendouTabPanel>
				) : null}
			</SendouTabs>
		</ActionSectionWrapper>
	);
}

function ActionSectionWrapper({ children }: { children: React.ReactNode }) {
	return <div className={styles.actionSectionWrapper}>{children}</div>;
}

function ScreenBanIcons({ banned }: { banned: boolean }) {
	const { t } = useTranslation(["weapons"]);

	return (
		<div
			className={clsx(styles.noScreen, {
				[styles.noScreenBanned]: banned,
			})}
			data-testid={`screen-${banned ? "banned" : "allowed"}`}
		>
			{banned ? <X /> : <Check />}
			<Image
				path={specialWeaponImageUrl(SPLATTERCOLOR_SCREEN_ID)}
				width={24}
				height={24}
				alt={t(`weapons:SPECIAL_${SPLATTERCOLOR_SCREEN_ID}`)}
			/>
		</div>
	);
}

function EndSetPopover({
	teams,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const { t } = useTranslation(["tournament"]);
	const [selectedWinner, setSelectedWinner] = React.useState<
		number | null | undefined
	>(undefined);

	return (
		<SendouPopover
			placement="top"
			trigger={
				<SendouButton
					className={clsx(
						styles.stageBannerUndoButton,
						styles.stageBannerEndSetButton,
					)}
					size="miniscule"
					variant="destructive"
				>
					{t("tournament:match.action.endSet")}
				</SendouButton>
			}
		>
			<Form method="post" className="stack md">
				<div className="stack sm">
					<Label className="mx-auto">
						{t("tournament:match.endSet.selectWinner")}
					</Label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value="random"
							checked={selectedWinner === null}
							onChange={() => setSelectedWinner(null)}
						/>
						<span>{t("tournament:match.endSet.randomWinner")}</span>
					</label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value={teams[0].id}
							checked={selectedWinner === teams[0].id}
							onChange={() => setSelectedWinner(teams[0].id)}
						/>
						<span>{teams[0].name}</span>
					</label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value={teams[1].id}
							checked={selectedWinner === teams[1].id}
							onChange={() => setSelectedWinner(teams[1].id)}
						/>
						<span>{teams[1].name}</span>
					</label>
				</div>

				<input
					type="hidden"
					name="winnerTeamId"
					value={selectedWinner === null ? "null" : (selectedWinner ?? "")}
				/>

				<SubmitButton
					_action="END_SET"
					testId="end-set-button"
					size="miniscule"
					className="mx-auto"
					isDisabled={selectedWinner === undefined}
				>
					{t("tournament:match.action.confirmEndSet")}
				</SubmitButton>
			</Form>
		</SendouPopover>
	);
}
