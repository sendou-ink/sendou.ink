import type { TFunction } from "i18next";
import { Ban, Check, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { MatchTimeline } from "~/components/match-page/MatchTimeline";
import { useMatchWeaponReport } from "~/components/match-page/useMatchWeaponReport";
import { WeaponReporter } from "~/components/match-page/WeaponReporter";
import { useUser } from "~/features/auth/core/user";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	resolveGroupNames,
	resolveTimelineMaps,
	resolveTimelineTeams,
} from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { MatchmadeRejoinSection, TrustedRejoinSection } from "./RejoinSections";
import styles from "./SendouQMatchActionTab.module.css";

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
	if (data.match.isCanceled) return null;

	const { isDecisive } = SendouQMatch.score(data.match);
	const awaitingConfirmation = !data.match.isLocked && isDecisive;
	const isLocked = data.match.isLocked;

	const cancelRequesterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: data.match.cancelRequestedByUserId,
	});
	const cancelRequestedByGroupId =
		cancelRequesterSide === "ALPHA"
			? data.match.groupAlpha.id
			: cancelRequesterSide === "BRAVO"
				? data.match.groupBravo.id
				: undefined;

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
						icon={<X />}
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
						variant="outlined"
						icon={<Check />}
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
	const { t } = useTranslation(["q"]);
	const user = useUser();

	const { alphaWins, bravoWins } = SendouQMatch.score(data.match);
	const score = { alpha: alphaWins, bravo: bravoWins };
	const teams = resolveTimelineTeams(data.match, t);
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
	const reporterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: decidingReportedByUserId,
	});
	const isOnReporterTeam = awaitingConfirmation && reporterSide === viewerSide;
	const isOnConfirmerTeam =
		awaitingConfirmation &&
		reporterSide !== null &&
		reporterSide !== viewerSide;

	const showTimeline = !data.match.isLocked;

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			{isStaffOnly || !viewerGroup || !user ? (
				<div className={styles.rematchContent}>
					{showTimeline ? (
						<MatchTimeline compact teams={teams} score={score} maps={maps} />
					) : null}
					{isStaffOnly && awaitingConfirmation ? (
						<ScoreConfirmerSection data={data} />
					) : null}
				</div>
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

					{showTimeline ? (
						<MatchTimeline compact teams={teams} score={score} maps={maps} />
					) : null}
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
	const completedMaps = data.match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	);

	const pastReported = data.reportedWeapons
		? data.reportedWeapons
				.filter((w) => w.userId === viewerUserId)
				.map((w) => ({ mapIndex: w.mapIndex, weaponSplId: w.weaponSplId }))
		: [];

	const weaponReport = useMatchWeaponReport({
		maps: completedMaps.map((m) => ({ stageId: m.stageId, mode: m.mode })),
		pastReported,
	});

	if (completedMaps.length === 0) return null;

	return <WeaponReporter {...weaponReport} />;
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
						t,
					}),
					setEndingTeamIds,
				}
			: undefined;

	const scoreIsNotZero = alphaScore > 0 || bravoScore > 0;

	const weaponReport = useMatchWeaponReport({
		maps: data.match.mapList
			.slice(0, reportedCount + 1)
			.map((m) => ({ stageId: m.stageId, mode: m.mode })),
		pastReported: data.reportedWeapons
			? data.reportedWeapons
					.filter((w) => w.userId === user.id)
					.map((w) => ({ mapIndex: w.mapIndex, weaponSplId: w.weaponSplId }))
			: [],
	});

	const groupNames = resolveGroupNames(data.match, t);

	return (
		<MatchActionTab
			key={reportedCount}
			teams={[
				{ id: data.match.groupAlpha.id, name: groupNames.alpha },
				{ id: data.match.groupBravo.id, name: groupNames.bravo },
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
			weaponReport={isStaffOnly ? undefined : weaponReport}
			actionButtons={
				<>
					{isStaffOnly ? (
						<FormWithConfirm
							fields={[["_action", "ADMIN_CANCEL"]]}
							dialogHeading={t("q:match.adminCancel.confirm")}
							submitButtonText={t("common:actions.confirm")}
							fetcher={cancelFetcher}
						>
							<SendouButton
								variant="minimal-destructive"
								size="miniscule"
								icon={<Ban size={16} />}
							>
								{t("q:match.action.adminCancel")}
							</SendouButton>
						</FormWithConfirm>
					) : (
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
	t,
}: {
	match: SendouQMatchLoaderData["match"];
	scores: [number, number];
	t: TFunction<["q"]>;
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

	return {
		teams: resolveTimelineTeams(match, t),
		score: { alpha: scores[0], bravo: scores[1] },
		maps: previousMaps,
		currentRosters: {
			alpha: match.groupAlpha.members,
			bravo: match.groupBravo.members,
		},
	};
}
