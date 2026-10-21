import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { MatchTimeline } from "~/components/match-page/MatchTimeline";
import { useMatchWeaponReport } from "~/components/match-page/useMatchWeaponReport";
import { WeaponReporter } from "~/components/match-page/WeaponReporter";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import * as LobbySet from "../core/LobbySet";
import { LOBBY_SIDE_TEAM_ID, type LobbySide } from "../lobbies-constants";
import { type LobbySetData, useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyActionTab.module.css";
import { usersOf } from "./LobbyMatchBanner";

/** Reporting the maps of the viewer's set, then confirming (or undoing) its result. */
export function LobbyActionTab() {
	const { currentSet, viewerSide } = useLobbyView();

	if (!currentSet || !viewerSide) return null;

	return LobbySet.status(currentSet) === "REPORTING" ? (
		<ReportingTab set={currentSet} viewerSide={viewerSide} />
	) : (
		<ConfirmationTab set={currentSet} viewerSide={viewerSide} />
	);
}

function ReportingTab({
	set,
	viewerSide,
}: {
	set: LobbySetData;
	viewerSide: LobbySide;
}) {
	const { t } = useTranslation(["lobbies", "q"]);
	const reportMap = useActionSubmit(lobbyActionSchema);
	const undoReport = useActionSubmit(lobbyActionSchema);
	const weaponReport = useLobbyWeaponReport(set);

	const currentIndex = LobbySet.currentGameIndex(set)!;
	const currentGame = set.games[currentIndex];
	const reportedCount = LobbySet.reportedCount(set);
	const { alpha, bravo, mapsToWin } = LobbySet.score(set);

	const sideOfTeamId = (teamId: number): LobbySide =>
		teamId === LOBBY_SIDE_TEAM_ID.ALPHA ? "ALPHA" : "BRAVO";
	const teams = useSideTeams();

	const setEndingTeamIds = [
		...(alpha + 1 === mapsToWin ? [LOBBY_SIDE_TEAM_ID.ALPHA] : []),
		...(bravo + 1 === mapsToWin ? [LOBBY_SIDE_TEAM_ID.BRAVO] : []),
	];
	const rosters = {
		alpha: usersOf(set, "ALPHA"),
		bravo: usersOf(set, "BRAVO"),
	};

	return (
		<MatchActionTab
			key={reportedCount}
			teams={[teams.ALPHA, teams.BRAVO]}
			ownTeamId={LOBBY_SIDE_TEAM_ID[viewerSide]}
			stageId={currentGame.stageId}
			mode={currentGame.mode}
			withKo={false}
			isSubmitting={reportMap.state !== "idle"}
			setEnding={
				setEndingTeamIds.length > 0
					? {
							teams: {
								alpha: { name: teams.ALPHA.name },
								bravo: { name: teams.BRAVO.name },
							},
							score: { alpha, bravo },
							maps: set.games
								.filter((game) => game.winnerSide !== null)
								.map((game) => ({
									stageId: game.stageId,
									mode: game.mode,
									timestamp: Date.now(),
									winner: game.winnerSide!,
									rosters,
								})),
							currentRosters: rosters,
							setEndingTeamIds,
						}
					: undefined
			}
			onSubmit={({ winnerId }) =>
				reportMap.submit("REPORT_MAP", {
					setId: set.id,
					winnerSide: sideOfTeamId(winnerId),
					reportedCount,
				})
			}
			secondaryAction={<WeaponReporter {...weaponReport} />}
			actionButtons={
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					icon={<Undo2 size={16} />}
					isPending={undoReport.state !== "idle"}
					isDisabled={reportedCount === 0}
					onClick={() =>
						undoReport.submit("UNDO_MAP_REPORT", {
							setId: set.id,
							reportedCount,
						})
					}
				>
					{t("q:match.undoReport")}
				</SendouButton>
			}
		/>
	);
}

function ConfirmationTab({
	set,
	viewerSide,
}: {
	set: LobbySetData;
	viewerSide: LobbySide;
}) {
	const { t } = useTranslation(["lobbies", "q"]);
	const { data } = useLobbyView();
	const confirmSet = useActionSubmit(lobbyActionSchema);
	const disputeSet = useActionSubmit(lobbyActionSchema);
	const undoReport = useActionSubmit(lobbyActionSchema);
	const weaponReport = useLobbyWeaponReport(set);
	const teams = useSideTeams();

	const viewerId = data.viewer!.id;
	const { alpha, bravo } = LobbySet.score(set);
	const winner = LobbySet.winnerSide(set);
	const ownScore =
		viewerSide === "ALPHA" ? `${alpha}-${bravo}` : `${bravo}-${alpha}`;
	const isDisputed = LobbySet.status(set) === "DISPUTED";

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.confirmation}>
				<MatchTimeline
					compact
					teams={{
						alpha: { name: teams.ALPHA.name },
						bravo: { name: teams.BRAVO.name },
					}}
					score={{ alpha, bravo }}
					maps={[]}
				/>
				{isDisputed ? (
					<p className="text-warning text-sm text-center">
						{t("lobbies:confirm.disputed")}
					</p>
				) : null}
				{LobbySet.canConfirm(set, viewerId) ? (
					<div className="stack md items-center">
						<p className="text-lighter text-xs text-center">
							{t("q:match.confirmScore.check")}
						</p>
						<SendouButton
							variant={winner === viewerSide ? "success" : "destructive"}
							isPending={confirmSet.state !== "idle"}
							onClick={() =>
								confirmSet.submit("CONFIRM_SET", { setId: set.id })
							}
							testId="lobby-confirm-set-button"
						>
							{winner === viewerSide
								? t("q:match.confirmScore.win", { score: ownScore })
								: t("q:match.confirmScore.loss", { score: ownScore })}
						</SendouButton>
						{LobbySet.canDispute(set, viewerId) ? (
							<SendouButton
								variant="minimal-destructive"
								size="small"
								isPending={disputeSet.state !== "idle"}
								onClick={() =>
									disputeSet.submit("DISPUTE_SET", { setId: set.id })
								}
							>
								{t("q:match.confirmScore.wrong")}
							</SendouButton>
						) : null}
					</div>
				) : null}
				{LobbySet.canUndo(set, viewerId) ? (
					<div className="stack md items-center">
						<p className="text-lighter text-sm">
							{t("q:match.waitingForConfirmation")}
						</p>
						<SendouButton
							variant="outlined"
							size="small"
							isPending={undoReport.state !== "idle"}
							onClick={() =>
								undoReport.submit("UNDO_MAP_REPORT", {
									setId: set.id,
									reportedCount: LobbySet.reportedCount(set),
								})
							}
						>
							{t("q:match.undoReport")}
						</SendouButton>
					</div>
				) : null}
				<WeaponReporter {...weaponReport} standalone />
			</div>
		</SendouTabPanel>
	);
}

function useSideTeams() {
	const { t } = useTranslation(["lobbies"]);

	return {
		ALPHA: { id: LOBBY_SIDE_TEAM_ID.ALPHA, name: t("lobbies:side.ALPHA") },
		BRAVO: { id: LOBBY_SIDE_TEAM_ID.BRAVO, name: t("lobbies:side.BRAVO") },
	};
}

function useLobbyWeaponReport(set: LobbySetData) {
	const { data } = useLobbyView();
	const viewerId = data.viewer!.id;
	const playableCount = Math.min(
		set.games.length,
		LobbySet.reportedCount(set) + (LobbySet.winnerSide(set) ? 0 : 1),
	);

	return useMatchWeaponReport({
		maps: set.games.slice(0, playableCount).map((game) => ({
			mapIndex: game.index,
			stageId: game.stageId,
			mode: game.mode,
		})),
		pastReported: data.reportedWeapons
			.filter(
				(weapon) => weapon.lobbySetId === set.id && weapon.userId === viewerId,
			)
			.map((weapon) => ({
				mapIndex: weapon.mapIndex,
				weaponSplId: weapon.weaponSplId,
			})),
		weaponPoolIds: data.viewer?.weaponPool,
	});
}
