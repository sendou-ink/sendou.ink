import { Ban, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useRecentlyReportedWeapons } from "~/features/sendouq/q-hooks";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import styles from "./SendouQMatchActionTab.module.css";

export function SendouQMatchActionTab({
	data,
	currentMap,
	ownTeamId,
	ownUserId,
	reportedCount,
}: {
	data: SendouQMatchLoaderData;
	currentMap: { stageId: StageId; mode: ModeShort };
	ownTeamId: number;
	ownUserId: number;
	reportedCount: number;
}) {
	const { t } = useTranslation(["q", "common"]);
	const fetcher = useFetcher();
	const undoFetcher = useFetcher();
	const cancelFetcher = useFetcher();
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const {
		mapsToWin,
		alphaWins: alphaScore,
		bravoWins: bravoScore,
	} = SendouQMatch.score(data.match);

	const cancelRequesterIsAlpha = data.match.groupAlpha.members.some(
		(m) => m.id === data.match.cancelRequestedByUserId,
	);
	const cancelRequestedByGroupId = data.match.cancelRequestedByUserId
		? cancelRequesterIsAlpha
			? data.match.groupAlpha.id
			: data.match.groupBravo.id
		: undefined;

	if (cancelRequestedByGroupId === ownTeamId) {
		return (
			<SendouTabPanel id={TAB_KEYS.ACTION}>
				<div className={styles.cancelWaiting}>
					{t("q:match.cancelPendingConfirmation")}
				</div>
			</SendouTabPanel>
		);
	}

	if (
		cancelRequestedByGroupId != null &&
		cancelRequestedByGroupId !== ownTeamId
	) {
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
				.filter((w) => w.userId === ownUserId)
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
			onSubmit={(winnerId) => {
				fetcher.submit(
					{
						_action: "REPORT_SCORE",
						winnerId: String(winnerId),
						reportedCount: String(reportedCount),
					},
					{ method: "post" },
				);
			}}
			weaponReport={{
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
			}}
			actionButtons={
				<>
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
					{scoreIsNotZero ? (
						<SendouButton
							variant="minimal-destructive"
							size="miniscule"
							icon={<Undo2 size={16} />}
							isPending={undoFetcher.state !== "idle"}
							onPress={() => {
								undoFetcher.submit(
									{ _action: "UNDO_MAP_REPORT" },
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
