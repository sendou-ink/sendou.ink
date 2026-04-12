import { differenceInMinutes } from "date-fns";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import type { TimelineMap } from "~/components/match-page/MatchTimeline";
import { MatchTimeline } from "~/components/match-page/MatchTimeline";
import { useUser } from "~/features/auth/core/user";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { teamPage } from "~/utils/urls";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { resolveGroupMemberOf } from "../q-match-utils";
import { SendouQMatchActionTab } from "./SendouQMatchActionTab";

export function SendouQMatchTabs({
	data,
}: {
	data: SerializeFrom<SendouQMatchLoaderData>;
}) {
	const user = useUser();
	const confirmFetcher = useFetcher();
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;

	const userSide = resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: user?.id,
	});
	const ownTeamId =
		userSide === "ALPHA"
			? data.match.groupAlpha.id
			: userSide === "BRAVO"
				? data.match.groupBravo.id
				: data.match.groupAlpha.id;

	const reportedCount = data.match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	).length;

	// xxx: util or Module
	const mapsToWin = Math.ceil(SENDOUQ_BEST_OF / 2);
	const alphaWins = data.match.mapList.filter(
		(m) => m.winnerGroupId === data.match.groupAlpha.id,
	).length;
	const bravoWins = data.match.mapList.filter(
		(m) => m.winnerGroupId === data.match.groupBravo.id,
	).length;
	const awaitingConfirmation =
		!data.match.isLocked && (alphaWins >= mapsToWin || bravoWins >= mapsToWin);

	const reporterGroupId = data.match.reportedByUserId
		? data.match.groupAlpha.members.some(
				(m) => m.id === data.match.reportedByUserId,
			)
			? data.match.groupAlpha.id
			: data.match.groupBravo.id
		: undefined;
	const isOnReporterTeam =
		awaitingConfirmation && reporterGroupId === ownTeamId;

	const showActionTab =
		!data.match.isLocked && !awaitingConfirmation && currentMap;

	const tabs: Array<"join" | "rosters" | "action" | "result"> =
		awaitingConfirmation
			? ["result", "rosters"]
			: showActionTab
				? ["join", "rosters", "action"]
				: data.match.isLocked
					? ["result", "rosters"]
					: ["join", "rosters"];

	const allMembers = [
		...data.match.groupAlpha.members,
		...data.match.groupBravo.members,
	];

	// roomLinks are ordered by refreshedAt asc, so the first valid one is the oldest confirmed room
	const validRoomLink = data.roomLinks.find(
		(rl) => rl.refreshedAt >= data.match.createdAt,
	);
	const ownStaleRoomLink = validRoomLink
		? undefined
		: data.roomLinks.find((rl) => rl.userId === user?.id);

	const activeRoomLink = validRoomLink ?? ownStaleRoomLink;
	const isStale = activeRoomLink ? !validRoomLink : undefined;
	const staleMinutesAgo = ownStaleRoomLink
		? differenceInMinutes(
				new Date(),
				databaseTimestampToDate(ownStaleRoomLink.refreshedAt),
			)
		: 0;
	const hostedByUsername = activeRoomLink
		? allMembers.find((m) => m.id === activeRoomLink.userId)?.username
		: undefined;

	return (
		<MatchTabs tabs={tabs}>
			{data.match.isLocked ? (
				<MatchResultTab
					teams={resolveTimelineTeams(data.match)}
					score={{
						alpha: alphaWins,
						bravo: bravoWins,
					}}
					maps={resolveTimelineMaps(data.match)}
				/>
			) : awaitingConfirmation ? (
				isOnReporterTeam ? (
					<ReporterWaitingTab data={data} />
				) : (
					<ConfirmerTab data={data} reportedCount={reportedCount} />
				)
			) : (
				<MatchJoinTab
					joinLink={activeRoomLink?.url}
					hostedBy={hostedByUsername}
					isStale={isStale}
					staleMinutesAgo={staleMinutesAgo}
					refreshedAt={
						validRoomLink
							? databaseTimestampToDate(validRoomLink.refreshedAt)
							: undefined
					}
					onConfirmRoom={() => {
						confirmFetcher.submit(
							{ _action: "CONFIRM_ROOM" },
							{ method: "post" },
						);
					}}
					isConfirming={confirmFetcher.state !== "idle"}
					pool={`SQ${String(data.match.id).at(-1)}`}
					pass={resolveRoomPass(data.match.id)}
					showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
				/>
			)}
			<MatchRosterTab
				minMembersPerTeam={4}
				canEditSubbedOut={[false, false]}
				teams={[
					{
						team: mapRosterTeam(data.match.groupAlpha.team),
						defaultName: t("q:match.groupAlpha"),
						members: data.match.groupAlpha.members,
					},
					{
						team: mapRosterTeam(data.match.groupBravo.team),
						defaultName: t("q:match.groupBravo"),
						members: data.match.groupBravo.members,
					},
				]}
			/>
			{showActionTab ? (
				<SendouQMatchActionTab
					data={data}
					currentMap={currentMap}
					ownTeamId={ownTeamId}
					reportedCount={reportedCount}
				/>
			) : null}
		</MatchTabs>
	);
}

function ConfirmerTab({
	data,
	reportedCount,
}: {
	data: SerializeFrom<SendouQMatchLoaderData>;
	reportedCount: number;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["q"]);

	const decidingMap = [...data.match.mapList]
		.reverse()
		.find((m) => m.winnerGroupId !== null);

	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<MatchTimeline
				teams={resolveTimelineTeams(data.match)}
				score={{
					alpha: data.match.mapList.filter(
						(m) => m.winnerGroupId === data.match.groupAlpha.id,
					).length,
					bravo: data.match.mapList.filter(
						(m) => m.winnerGroupId === data.match.groupBravo.id,
					).length,
				}}
				maps={resolveTimelineMaps(data.match)}
			/>
			<div className="stack md items-center mt-4">
				<SendouButton
					variant="primary"
					isPending={fetcher.state !== "idle"}
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
		</SendouTabPanel>
	);
}

function ReporterWaitingTab({
	data,
}: {
	data: SerializeFrom<SendouQMatchLoaderData>;
}) {
	const undoFetcher = useFetcher();
	const { t } = useTranslation(["q"]);

	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<MatchTimeline
				teams={resolveTimelineTeams(data.match)}
				score={{
					alpha: data.match.mapList.filter(
						(m) => m.winnerGroupId === data.match.groupAlpha.id,
					).length,
					bravo: data.match.mapList.filter(
						(m) => m.winnerGroupId === data.match.groupBravo.id,
					).length,
				}}
				maps={resolveTimelineMaps(data.match)}
			/>
			<div className="stack md items-center mt-4">
				<p className="text-lighter text-sm">
					{t("q:match.waitingForConfirmation")}
				</p>
				<SendouButton
					variant="outlined"
					size="small"
					isPending={undoFetcher.state !== "idle"}
					onPress={() => {
						undoFetcher.submit({ _action: "UNDO_REPORT" }, { method: "post" });
					}}
				>
					{t("q:match.undoReport")}
				</SendouButton>
			</div>
		</SendouTabPanel>
	);
}

type MatchData = SerializeFrom<SendouQMatchLoaderData>["match"];

function resolveTimelineTeams(match: MatchData) {
	return {
		alpha: {
			// xxx: this stuff is copypasted in quite a few places
			name: match.groupAlpha.team?.name ?? "Group Alpha",
			avatar: match.groupAlpha.team?.avatarUrl ?? undefined,
		},
		bravo: {
			name: match.groupBravo.team?.name ?? "Group Bravo",
			avatar: match.groupBravo.team?.avatarUrl ?? undefined,
		},
	};
}

function resolveTimelineMaps(match: MatchData): TimelineMap[] {
	return match.mapList
		.filter((m) => m.winnerGroupId !== null)
		.map((map) => ({
			stageId: map.stageId,
			mode: map.mode,
			timestamp: match.createdAt,
			winner:
				map.winnerGroupId === match.groupAlpha.id
					? ("ALPHA" as const)
					: ("BRAVO" as const),
			rosters: {
				alpha: match.groupAlpha.members,
				bravo: match.groupBravo.members,
			},
		}));
}

function mapRosterTeam(
	team: {
		id: number;
		name: string;
		customUrl: string;
		avatarUrl: string | null;
	} | null,
) {
	if (!team) return undefined;
	return {
		id: team.id,
		name: team.name,
		url: teamPage(team.customUrl),
		avatar: team.avatarUrl ?? undefined,
	};
}
