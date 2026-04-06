import { differenceInMinutes } from "date-fns";
import { Scale, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Main } from "~/components/Main";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import {
	MatchBanner,
	MatchBannerContainer,
	MultiMatchBanner,
} from "~/components/match-page/MatchBanner";
import bannerStyles from "~/components/match-page/MatchBanner.module.css";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import type { ParsedMemento } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SENDOUQ_RULES_PAGE, teamPage } from "~/utils/urls";
import { action } from "../actions/q.match.$id.server";
import { loader } from "../loaders/q.match.$id.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

// xxx: translate all

export default function SendouQMatchPage() {
	return (
		<Main>
			<MatchPage>
				<SendouQMatchHeader />
				<SendouQMatchBanner />
				<SendouQMatchTabs />
			</MatchPage>
		</Main>
	);
}

function SendouQMatchHeader() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q"]);

	const season = Seasons.currentOrPrevious(
		databaseTimestampToDate(data.match.createdAt),
	)?.nth;

	return (
		<MatchPageHeader
			subtitle={`SendouQ Season ${season}`}
			topRight={
				<LinkButton
					to={SENDOUQ_RULES_PAGE}
					variant="outlined"
					size="small"
					icon={<Scale />}
				>
					{t("q:front.nav.rules.title")}
				</LinkButton>
			}
		>
			{t("q:match.header", { number: data.match.id })}
		</MatchPageHeader>
	);
}

function SendouQMatchBannerTopRow() {
	const data = useLoaderData<typeof loader>();
	useAutoRerender("ten seconds");

	const countScore = (groupId: number) =>
		data.match.mapList.reduce(
			(acc, map) => acc + (map.winnerGroupId === groupId ? 1 : 0),
			0,
		);

	const now = new Date();
	const startedAt = databaseTimestampToDate(data.match.createdAt);

	// xxx: change to reported of a map
	const lastReportAt = data.match.reportedAt
		? databaseTimestampToDate(data.match.reportedAt)
		: startedAt;

	return (
		<MatchBannerTopRow
			score={{
				alpha: countScore(data.match.groupAlpha.id),
				bravo: countScore(data.match.groupBravo.id),
				isFinal: Boolean(data.match.isLocked),
				count: SENDOUQ_BEST_OF,
				bestOf: true,
			}}
			time={{
				currentMinutes: Math.max(0, differenceInMinutes(now, lastReportAt)),
				totalMinutes: Math.max(0, differenceInMinutes(now, startedAt)),
			}}
		/>
	);
}

function SendouQMatchBanner() {
	const data = useLoaderData<typeof loader>();

	const bottomRow = (
		<MatchBannerBottomRow
			games={data.match.mapList.map((map) => ({
				mode: map.mode,
				winner:
					map.winnerGroupId === data.match.groupAlpha.id
						? "ALPHA"
						: map.winnerGroupId === data.match.groupBravo.id
							? "BRAVO"
							: undefined,
			}))}
			activeRosters={{
				alpha: data.match.groupAlpha.members,
				bravo: data.match.groupBravo.members,
			}}
		/>
	);

	if (data.match.isLocked) {
		const playedStageIds = data.match.mapList
			.filter((m) => m.winnerGroupId !== null)
			.map((m) => m.stageId);

		return (
			<MatchBannerContainer>
				<SendouQMatchBannerTopRow />
				<MultiMatchBanner stageIds={playedStageIds} />
				{bottomRow}
			</MatchBannerContainer>
		);
	}

	const currentMap = data.match.currentMap;
	invariant(currentMap);

	return (
		<MatchBannerContainer>
			<SendouQMatchBannerTopRow />
			<MatchBanner
				stageId={currentMap.stageId}
				mode={currentMap.mode}
				screenLegal={
					!data.match.groupAlpha.noScreen && !data.match.groupBravo.noScreen
				}
			>
				<CurrentMapVotesBadge currentMap={currentMap} />
			</MatchBanner>
			{bottomRow}
		</MatchBannerContainer>
	);
}

function SendouQMatchTabs() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;
	invariant(currentMap);

	return (
		<MatchTabs tabs={["join", "rosters", "action"]}>
			<MatchJoinTab
				joinLink="https://app.nintendo.net/private_battle/abc123"
				hostedBy={{
					id: 1,
					username: "Grey",
					discordId: "123456789",
					discordAvatar: null,
					customUrl: null,
				}}
				pool="SQ7"
				pass="8430"
				showNoSplatnetAlert
			/>
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
			<MatchActionTab
				teams={[
					{ id: data.match.groupAlpha.id, name: "Group Alpha" },
					{ id: data.match.groupBravo.id, name: "Group Bravo" },
				]}
				ownTeamId={1}
				stageId={currentMap.stageId}
				mode={currentMap.mode}
				withPoints={false}
			/>
		</MatchTabs>
	);
}

function CurrentMapVotesBadge({
	currentMap,
}: {
	currentMap: { mode: ModeShort; stageId: StageId; source: string };
}) {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	const voterIds = currentMapVoterIds({
		currentMap,
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		pools: data.match.memento?.pools,
	});

	if (voterIds.length === 0) return null;

	const userIdToUser = (userId: number) =>
		[...data.match.groupAlpha.members, ...data.match.groupBravo.members].find(
			(m) => m.id === userId,
		);

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={bannerStyles.infoBadge}>
					{voterIds.length} <Vote />
				</SendouButton>
			}
		>
			<div className="stack sm">
				<div className="text-sm text-lighter font-semi-bold">
					{t("q:match.mapVoters.header")}
				</div>
				{voterIds.map((userId) => {
					const user = userIdToUser(userId);
					return (
						<div key={userId} className="stack sm horizontal items-center xs">
							<Avatar user={user} size="xxs" />
							{user?.username}
						</div>
					);
				})}
			</div>
		</SendouPopover>
	);
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

// xxx: probably can be made cleaner -> more work in the loader
function currentMapVoterIds({
	currentMap,
	groupAlpha,
	groupBravo,
	pools,
}: {
	currentMap: { mode: ModeShort; stageId: StageId; source: string };
	groupAlpha: { id: number; members: Array<{ id: number }> };
	groupBravo: { id: number; members: Array<{ id: number }> };
	pools: ParsedMemento["pools"] | undefined;
}): number[] {
	if (!pools) return [];

	const pickerGroups = [groupAlpha, groupBravo].filter(
		(g) => currentMap.source === "BOTH" || String(g.id) === currentMap.source,
	);
	if (pickerGroups.length === 0) return [];

	const result: number[] = [];
	for (const pickerGroup of pickerGroups) {
		for (const { userId, pool } of pools) {
			if (!pickerGroup.members.some((m) => m.id === userId)) continue;
			const modePool = pool.find((p) => p.mode === currentMap.mode);
			if (modePool?.stages.includes(currentMap.stageId)) {
				result.push(userId);
			}
		}
	}
	return result;
}
