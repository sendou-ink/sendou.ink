import { differenceInMinutes } from "date-fns";
import { Flag, Hourglass, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	IconBanner,
	MatchBanner,
	MatchBannerContainer,
	MultiMatchBanner,
	preloadStageBanners,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerStartedAt } from "~/components/match-page/MatchBannerStartedAt";
import { MatchBannerTimer } from "~/components/match-page/MatchBannerTimer";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { resolveRoomPass } from "~/components/match-page/utils";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import * as LobbySet from "../core/LobbySet";
import { PLAYERS_PER_SET } from "../lobbies-constants";
import { type LobbySetData, useLobbyView } from "../lobbies-hooks";

export function LobbyMatchBanner() {
	const { t } = useTranslation(["lobbies"]);
	const { data, currentSet, roomMembers, isViewerInRoom } = useLobbyView();

	if (data.lobby.endedAt !== null) {
		return (
			<MatchBannerContainer>
				{currentSet ? <SetTopRow set={currentSet} /> : null}
				<IconBanner
					icon={<Flag size={32} />}
					header={t("lobbies:banner.ended")}
					testId="lobby-ended-banner"
				/>
			</MatchBannerContainer>
		);
	}

	const joinPool = isViewerInRoom ? `8S${(data.lobby.id % 9) + 1}` : null;

	if (!currentSet || LobbySet.isFinished(currentSet)) {
		const playableCount = roomMembers.filter(
			(member) => !member.isSittingOut,
		).length;
		const isShort = playableCount < PLAYERS_PER_SET;

		return (
			<MatchBannerContainer>
				{currentSet ? <SetTopRow set={currentSet} /> : null}
				<IconBanner
					icon={isShort ? <Users size={32} /> : <Hourglass size={32} />}
					header={
						isShort
							? t("lobbies:banner.waitingForPlayers", {
									count: playableCount,
									needed: PLAYERS_PER_SET,
								})
							: t("lobbies:banner.nextSet")
					}
					subtitle={
						isShort ? t("lobbies:banner.waitingForPlayers.subtitle") : undefined
					}
					joinPool={joinPool}
					testId="lobby-waiting-banner"
				/>
			</MatchBannerContainer>
		);
	}

	const joinPass = isViewerInRoom ? resolveRoomPass(currentSet.id) : null;
	const currentIndex = LobbySet.currentGameIndex(currentSet);
	const currentGame =
		currentIndex !== null ? currentSet.games[currentIndex] : null;

	const bottomRow = (
		<MatchBannerBottomRow
			games={currentSet.games.map((game) => ({ mode: game.mode }))}
			activeRosters={{
				alpha: usersOf(currentSet, "ALPHA"),
				bravo: usersOf(currentSet, "BRAVO"),
			}}
		/>
	);

	if (!currentGame) {
		return (
			<MatchBannerContainer>
				<SetTopRow set={currentSet} />
				<MultiMatchBanner
					stageIds={currentSet.games
						.filter((game) => game.winnerSide !== null)
						.map((game) => game.stageId)}
				/>
				{bottomRow}
			</MatchBannerContainer>
		);
	}

	preloadStageBanners(
		currentSet.games
			.filter((game) => game.winnerSide === null)
			.map((game) => game.stageId),
	);

	return (
		<MatchBannerContainer>
			<SetTopRow set={currentSet} />
			<MatchBanner
				stageId={currentGame.stageId}
				mode={currentGame.mode}
				joinPool={joinPool}
				joinPass={joinPass}
			/>
			{bottomRow}
		</MatchBannerContainer>
	);
}

function SetTopRow({ set }: { set: LobbySetData }) {
	const now = useAutoRerender("ten seconds");
	const { alpha, bravo } = LobbySet.score(set);
	const isFinished = LobbySet.isFinished(set);
	const isDecided = LobbySet.winnerSide(set) !== null;

	const startedAt = databaseTimestampToDate(set.createdAt);
	const lastReportedAt = set.games.reduce<number | null>(
		(latest, game) =>
			game.reportedAt && (!latest || game.reportedAt > latest)
				? game.reportedAt
				: latest,
		null,
	);

	return (
		<MatchBannerTopRow
			score={{
				alpha,
				bravo,
				isFinal: isFinished,
				count: set.bestOf,
				bestOf: true,
			}}
		>
			{isDecided ? (
				<MatchBannerStartedAt
					time={startedAt}
					endTime={
						lastReportedAt ? databaseTimestampToDate(lastReportedAt) : null
					}
				/>
			) : (
				<MatchBannerTimer
					time={{
						currentMinutes: Math.max(
							0,
							differenceInMinutes(
								now,
								lastReportedAt
									? databaseTimestampToDate(lastReportedAt)
									: startedAt,
							),
						),
						totalMinutes: Math.max(0, differenceInMinutes(now, startedAt)),
					}}
				/>
			)}
		</MatchBannerTopRow>
	);
}

/** The players of the side in the set. */
export function usersOf(set: LobbySetData, side: "ALPHA" | "BRAVO") {
	return set.participants.filter((participant) => participant.side === side);
}
