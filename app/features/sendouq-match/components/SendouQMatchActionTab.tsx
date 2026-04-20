import { Ban, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { MatchTimeline } from "~/components/match-page/MatchTimeline";
import { WeaponReporter } from "~/components/match-page/WeaponReporter";
import { useUser } from "~/features/auth/core/user";
import { useRecentlyReportedWeapons } from "~/features/sendouq/q-hooks";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { SENDOUQ_PAGE } from "~/utils/urls";
import {
	resolveMatchScore,
	resolveTimelineMaps,
	resolveTimelineTeams,
} from "../core/match-timeline";
import * as RejoinVote from "../core/RejoinVote";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { RematchVotePanel } from "./RematchVotePanel";
import styles from "./SendouQMatchActionTab.module.css";

// xxx: maybe divide Rejoin related components to a different file?

export function SendouQMatchActionTab({
	data,
	currentMap,
	ownTeamId,
	reportedCount,
	viewerSide,
}: {
	data: SendouQMatchLoaderData;
	currentMap?: { stageId: StageId; mode: ModeShort };
	ownTeamId: number | null;
	reportedCount: number;
	viewerSide: "ALPHA" | "BRAVO" | null;
}) {
	const user = useUser();
	if (!user) return null;

	const isStaffOnly = ownTeamId == null;
	const isCanceled = data.match.cancelAcceptedByUserId != null;
	if (isCanceled) return null;

	const { isDecisive } = SendouQMatch.score(data.match);
	const awaitingConfirmation = !data.match.isLocked && isDecisive;
	const isLocked = data.match.isLocked;

	const cancelRequesterIsAlpha = data.match.groupAlpha.members.some(
		(m) => m.id === data.match.cancelRequestedByUserId,
	);
	const cancelRequestedByGroupId = data.match.cancelRequestedByUserId
		? cancelRequesterIsAlpha
			? data.match.groupAlpha.id
			: data.match.groupBravo.id
		: undefined;

	// xxx: system messages for cancel sent, rejected or accepted and by who
	if (
		!awaitingConfirmation &&
		!isLocked &&
		!isStaffOnly &&
		cancelRequestedByGroupId === ownTeamId
	) {
		return <CancelPendingTab />;
	}

	if (
		!awaitingConfirmation &&
		!isLocked &&
		!isStaffOnly &&
		cancelRequestedByGroupId != null &&
		cancelRequestedByGroupId !== ownTeamId
	) {
		return <CancelRespondTab />;
	}

	if (isLocked) {
		return (
			<RequeueTab
				data={data}
				viewerSide={viewerSide}
				isStaffOnly={isStaffOnly}
				awaitingConfirmation={false}
			/>
		);
	}

	if (awaitingConfirmation) {
		return (
			<RequeueTab
				data={data}
				viewerSide={viewerSide}
				isStaffOnly={isStaffOnly}
				awaitingConfirmation={true}
			/>
		);
	}

	if (currentMap) {
		return (
			<InProgressTab
				data={data}
				currentMap={currentMap}
				ownTeamId={ownTeamId}
				reportedCount={reportedCount}
				user={user}
			/>
		);
	}

	return null;
}

function CancelPendingTab() {
	const { t } = useTranslation(["q"]);
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.cancelWaiting}>
				{t("q:match.cancelPendingConfirmation")}
			</div>
		</SendouTabPanel>
	);
}

function CancelRespondTab() {
	const { t } = useTranslation(["q", "common"]);
	const cancelFetcher = useFetcher();

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.cancelRespondRoot}>
				<div className={styles.cancelRespondHeader}>
					{t("q:match.action.acceptCancelingSet")}
				</div>
				<div className={styles.cancelRespondButtons}>
					<SendouButton
						variant="outlined"
						isDisabled={cancelFetcher.state !== "idle"}
						onPress={() => {
							cancelFetcher.submit(
								{ _action: "REFUSE_CANCEL" },
								{ method: "post" },
							);
						}}
					>
						{t("common:actions.refuse")}
					</SendouButton>
					<SendouButton
						variant="primary"
						isDisabled={cancelFetcher.state !== "idle"}
						onPress={() => {
							cancelFetcher.submit(
								{ _action: "ACCEPT_CANCEL" },
								{ method: "post" },
							);
						}}
					>
						{t("common:actions.accept")}
					</SendouButton>
				</div>
			</div>
		</SendouTabPanel>
	);
}

function RequeueTab({
	data,
	viewerSide,
	isStaffOnly,
	awaitingConfirmation,
}: {
	data: SendouQMatchLoaderData;
	viewerSide: "ALPHA" | "BRAVO" | null;
	isStaffOnly: boolean;
	awaitingConfirmation: boolean;
}) {
	const user = useUser();

	const score = resolveMatchScore(data.match);
	const teams = resolveTimelineTeams(data.match);
	const maps = resolveTimelineMaps(data.match, data.reportedWeapons);

	const viewerGroup =
		viewerSide === "ALPHA"
			? data.match.groupAlpha
			: viewerSide === "BRAVO"
				? data.match.groupBravo
				: null;

	const decidingReportedByUserId = [...data.match.mapList]
		.reverse()
		.find((m) => m.winnerGroupId !== null)?.reportedByUserId;
	const reporterSide: "ALPHA" | "BRAVO" | null = decidingReportedByUserId
		? data.match.groupAlpha.members.some(
				(m) => m.id === decidingReportedByUserId,
			)
			? "ALPHA"
			: "BRAVO"
		: null;
	const isOnReporterTeam = awaitingConfirmation && reporterSide === viewerSide;
	const isOnConfirmerTeam =
		awaitingConfirmation &&
		reporterSide !== null &&
		reporterSide !== viewerSide;

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			{isStaffOnly || !viewerGroup || !user ? (
				<MatchTimeline compact teams={teams} score={score} maps={maps} />
			) : (
				<div className={styles.rematchContent}>
					{viewerGroup.matchmade ? (
						<MatchmadeRejoinSection
							data={data}
							viewerGroup={viewerGroup}
							viewerUserId={user.id}
							awaitingConfirmation={awaitingConfirmation}
							isOnReporterTeam={isOnReporterTeam}
						/>
					) : null}
					{!viewerGroup.matchmade &&
					(!awaitingConfirmation || isOnReporterTeam) ? (
						<TrustedRejoinSection
							viewerGroup={viewerGroup}
							viewerUserId={user.id}
						/>
					) : null}
					{isOnReporterTeam ? <hr className={styles.divider} /> : null}

					<MatchTimeline compact teams={teams} score={score} maps={maps} />
					{isOnConfirmerTeam ? <ScoreConfirmerSection data={data} /> : null}
					{isOnReporterTeam ? <ReporterUndoSection /> : null}
					<WeaponReportSection data={data} viewerUserId={user.id} />
				</div>
			)}
		</SendouTabPanel>
	);
}

function WeaponReportSection({
	data,
	viewerUserId,
}: {
	data: SendouQMatchLoaderData;
	viewerUserId: number;
}) {
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const completedMaps = data.match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	);
	if (completedMaps.length === 0) return null;

	const pastReported: MainWeaponId[] = data.reportedWeapons
		? data.reportedWeapons
				.filter((w) => w.userId === viewerUserId)
				.map((w) => w.weaponSplId)
		: [];

	return (
		<WeaponReporter
			maps={completedMaps.map((m) => ({ stageId: m.stageId, mode: m.mode }))}
			pastReported={pastReported}
			quickSelectWeaponIds={recentlyReportedWeapons}
			isSubmitting={weaponFetcher.state !== "idle"}
			onSubmit={(weaponSplId) => {
				addRecentlyReportedWeapon(weaponSplId);
				const mapIndex = pastReported.length;
				const map = completedMaps[mapIndex];
				if (!map) return;
				weaponFetcher.submit(
					{
						_action: "REPORT_WEAPON",
						weaponSplId: String(weaponSplId),
						groupMatchMapId: String(map.id),
					},
					{ method: "post" },
				);
			}}
			onUndo={() => {
				const mapIndex = pastReported.length - 1;
				if (mapIndex < 0) return;
				weaponFetcher.submit(
					{
						_action: "UNDO_WEAPON_REPORT",
						mapIndex: String(mapIndex),
					},
					{ method: "post" },
				);
			}}
		/>
	);
}

function ScoreConfirmerSection({ data }: { data: SendouQMatchLoaderData }) {
	const { t } = useTranslation(["q"]);
	const fetcher = useFetcher();
	const confirmFetcherPending = fetcher.state !== "idle";

	const decidingMap = [...data.match.mapList]
		.reverse()
		.find((m) => m.winnerGroupId !== null);
	const reportedCount = data.match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	).length;

	return (
		<div className="stack md items-center">
			<SendouButton
				variant="primary"
				isPending={confirmFetcherPending}
				onPress={() => {
					if (!decidingMap?.winnerGroupId) return;
					fetcher.submit(
						{
							_action: "REPORT_SCORE",
							winnerId: String(decidingMap.winnerGroupId),
							reportedCount: String(reportedCount),
						},
						{ method: "post" },
					);
				}}
			>
				{t("q:match.confirmScore")}
			</SendouButton>
			<p className="text-lighter text-xs text-center">
				{t("q:match.confirmScore.wrongHint")}
			</p>
		</div>
	);
}

function ReporterUndoSection() {
	const { t } = useTranslation(["q"]);
	const undoFetcher = useFetcher();

	return (
		<div className="stack md items-center">
			<p className="text-lighter text-sm">
				{t("q:match.waitingForConfirmation")}
			</p>
			<SendouButton
				variant="outlined"
				size="small"
				isPending={undoFetcher.state !== "idle"}
				onPress={() => {
					undoFetcher.submit(
						{ _action: "UNDO_MATCH_REPORT" },
						{ method: "post" },
					);
				}}
			>
				{t("q:match.undoReport")}
			</SendouButton>
		</div>
	);
}

function MatchmadeRejoinSection({
	data,
	viewerGroup,
	viewerUserId,
	awaitingConfirmation,
	isOnReporterTeam,
}: {
	data: SendouQMatchLoaderData;
	viewerGroup: NonNullable<SendouQMatchLoaderData["match"]["groupAlpha"]>;
	viewerUserId: number;
	awaitingConfirmation: boolean;
	isOnReporterTeam: boolean;
}) {
	const voteFetcher = useFetcher();

	const votes = RejoinVote.extractOwnGroupVotesFromSendouqMatch(
		data.match,
		viewerUserId,
	);

	if (!votes) return null;

	if (RejoinVote.userContinueStatus(votes, viewerUserId) === false) {
		return <DeclinedSection />;
	}

	// During awaiting confirmation, only reporter team can cascade.
	if (awaitingConfirmation && !isOnReporterTeam) return null;

	return (
		<RematchVotePanel
			members={viewerGroup.members.map((m) => ({
				id: m.id,
				username: m.username,
				discordId: m.discordId,
				discordAvatar: m.discordAvatar,
				customUrl: m.customUrl,
			}))}
			votes={votes}
			viewerUserId={viewerUserId}
			isPending={voteFetcher.state !== "idle"}
			onVote={(isContinuing) => {
				voteFetcher.submit(
					{
						_action: "CAST_CONTINUE_VOTE",
						isContinuing: String(Number(isContinuing)),
					},
					{ method: "post" },
				);
			}}
		/>
	);
}

function TrustedRejoinSection({
	viewerGroup,
	viewerUserId,
}: {
	viewerGroup: NonNullable<SendouQMatchLoaderData["match"]["groupAlpha"]>;
	viewerUserId: number;
}) {
	const { t } = useTranslation(["q"]);
	const viewerRole = viewerGroup.members.find(
		(m) => m.id === viewerUserId,
	)?.role;
	const lookAgainFetcher = useFetcher();

	if (viewerRole === "OWNER") {
		return (
			<div className="stack md items-center">
				<SendouButton
					variant="primary"
					isPending={lookAgainFetcher.state !== "idle"}
					onPress={() => {
						lookAgainFetcher.submit(
							{
								_action: "LOOK_AGAIN",
								previousGroupId: String(viewerGroup.id),
							},
							{ method: "post" },
						);
					}}
				>
					{t("q:match.actions.lookAgain")}
				</SendouButton>
			</div>
		);
	}

	return (
		<p className="text-lighter text-sm text-center">
			{t("q:match.rematch.waitingCaptain")}
		</p>
	);
}

function DeclinedSection() {
	const { t } = useTranslation(["q"]);
	return (
		<div className="stack md items-center">
			<p className="text-lighter text-sm text-center">
				{t("q:match.rematch.declined")}
			</p>
			<Link to={SENDOUQ_PAGE} className="text-sm">
				{t("q:match.rematch.rejoinQueue")}
			</Link>
		</div>
	);
}

function InProgressTab({
	data,
	currentMap,
	ownTeamId,
	reportedCount,
	user,
}: {
	data: SendouQMatchLoaderData;
	currentMap: { stageId: StageId; mode: ModeShort };
	ownTeamId: number | null;
	reportedCount: number;
	user: { id: number };
}) {
	const { t } = useTranslation(["q", "common"]);
	const fetcher = useFetcher();
	const undoFetcher = useFetcher();
	const cancelFetcher = useFetcher();
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const isStaffOnly = ownTeamId == null;

	const {
		mapsToWin,
		alphaWins: alphaScore,
		bravoWins: bravoScore,
	} = SendouQMatch.score(data.match);

	const scores: [number, number] = [alphaScore, bravoScore];

	const setEndingTeamIds: number[] = [];
	if (alphaScore + 1 === mapsToWin) {
		setEndingTeamIds.push(data.match.groupAlpha.id);
	}
	if (bravoScore + 1 === mapsToWin) {
		setEndingTeamIds.push(data.match.groupBravo.id);
	}

	const setEnding =
		setEndingTeamIds.length > 0
			? {
					...buildSendouQSetEndingData({
						match: data.match,
						scores,
					}),
					setEndingTeamIds,
				}
			: undefined;

	const scoreIsNotZero = alphaScore > 0 || bravoScore > 0;

	const weaponReportMaps = data.match.mapList
		.slice(0, reportedCount + 1)
		.map((m) => ({ stageId: m.stageId, mode: m.mode }));

	const weaponPastReported: MainWeaponId[] = data.reportedWeapons
		? data.reportedWeapons
				.filter((w) => w.userId === user.id)
				.map((w) => w.weaponSplId)
		: [];

	return (
		<MatchActionTab
			key={reportedCount}
			teams={[
				{ id: data.match.groupAlpha.id, name: "Group Alpha" },
				{ id: data.match.groupBravo.id, name: "Group Bravo" },
			]}
			ownTeamId={ownTeamId}
			stageId={currentMap.stageId}
			mode={currentMap.mode}
			withPoints={false}
			isSubmitting={fetcher.state !== "idle"}
			setEnding={setEnding}
			onSubmit={({ winnerId }) => {
				fetcher.submit(
					{
						_action: "REPORT_SCORE",
						winnerId: String(winnerId),
						reportedCount: String(reportedCount),
					},
					{ method: "post" },
				);
			}}
			weaponReport={
				isStaffOnly
					? undefined
					: {
							maps: weaponReportMaps,
							pastReported: weaponPastReported,
							quickSelectWeaponIds: recentlyReportedWeapons,
							isSubmitting: weaponFetcher.state !== "idle",
							onSubmit: (weaponSplId) => {
								addRecentlyReportedWeapon(weaponSplId);
								const mapIndex = weaponPastReported.length;
								const map = data.match.mapList[mapIndex];
								weaponFetcher.submit(
									{
										_action: "REPORT_WEAPON",
										weaponSplId: String(weaponSplId),
										groupMatchMapId: String(map.id),
									},
									{ method: "post" },
								);
							},
							onUndo: () => {
								const mapIndex = weaponPastReported.length - 1;
								if (mapIndex < 0) return;
								weaponFetcher.submit(
									{
										_action: "UNDO_WEAPON_REPORT",
										mapIndex: String(mapIndex),
									},
									{ method: "post" },
								);
							},
						}
			}
			actionButtons={
				<>
					{isStaffOnly ? null : (
						<FormWithConfirm
							fields={[["_action", "REQUEST_CANCEL"]]}
							dialogHeading={t("q:match.cancelMatch.confirm")}
							submitButtonText={t("common:actions.confirm")}
							fetcher={cancelFetcher}
						>
							<SendouButton
								variant="minimal-destructive"
								size="miniscule"
								icon={<Ban size={16} />}
							>
								{t("q:match.action.requestCancel")}
							</SendouButton>
						</FormWithConfirm>
					)}
					{scoreIsNotZero ? (
						<SendouButton
							variant="minimal-destructive"
							size="miniscule"
							icon={<Undo2 size={16} />}
							isPending={undoFetcher.state !== "idle"}
							onPress={() => {
								const mapIndex = data.match.mapList.findLastIndex(
									(m) => m.winnerGroupId !== null,
								);
								if (mapIndex < 0) return;
								undoFetcher.submit(
									{
										_action: "UNDO_MAP_REPORT",
										mapIndex: String(mapIndex),
									},
									{ method: "post" },
								);
							}}
						>
							{t("q:match.undoReport")}
						</SendouButton>
					) : null}
				</>
			}
		/>
	);
}

function buildSendouQSetEndingData({
	match,
	scores,
}: {
	match: SendouQMatchLoaderData["match"];
	scores: [number, number];
}) {
	const completedMaps = match.mapList.filter((m) => m.winnerGroupId !== null);

	const previousMaps = completedMaps.map((map) => ({
		stageId: map.stageId,
		mode: map.mode,
		timestamp: Date.now(),
		winner:
			map.winnerGroupId === match.groupAlpha.id
				? ("ALPHA" as const)
				: ("BRAVO" as const),
		rosters: {
			alpha: match.groupAlpha.members,
			bravo: match.groupBravo.members,
		},
	}));

	const alphaTeam = match.groupAlpha.team;
	const bravoTeam = match.groupBravo.team;

	return {
		teams: {
			alpha: {
				name: alphaTeam?.name ?? "Group Alpha",
				avatar: alphaTeam?.avatarUrl ?? undefined,
			},
			bravo: {
				name: bravoTeam?.name ?? "Group Bravo",
				avatar: bravoTeam?.avatarUrl ?? undefined,
			},
		},
		score: { alpha: scores[0], bravo: scores[1] },
		maps: previousMaps,
		currentRosters: {
			alpha: match.groupAlpha.members,
			bravo: match.groupBravo.members,
		},
	};
}
