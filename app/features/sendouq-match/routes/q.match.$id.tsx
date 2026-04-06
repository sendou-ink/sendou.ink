import { Scale, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import {
	MatchBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import * as Seasons from "~/features/mmr/core/Seasons";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SENDOUQ_RULES_PAGE } from "~/utils/urls";
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

function SendouQMatchBanner() {
	const data = useLoaderData<typeof loader>();

	const countScore = (groupId: number) =>
		data.match.mapList.reduce(
			(acc, map) => acc + (map.winnerGroupId === groupId ? 1 : 0),
			0,
		);

	const reportedCount = data.match.mapList.filter(
		(map) => map.winnerGroupId,
	).length;

	const currentMap = data.match.mapList.at(reportedCount);
	invariant(currentMap);

	return (
		<MatchBannerContainer>
			<MatchBannerTopRow
				score={{
					alpha: countScore(data.match.groupAlpha.id),
					bravo: countScore(data.match.groupBravo.id),
					isFinal: Boolean(data.match.isLocked),
					count: SENDOUQ_BEST_OF,
					bestOf: true,
				}}
				time={{
					currentMinutes: 3,
					totalMinutes: 1,
				}}
			/>
			<MatchBanner
				stageId={currentMap.stageId}
				mode={currentMap.mode}
				screenLegal={
					!data.match.groupAlpha.noScreen && !data.match.groupBravo.noScreen
				}
			>
				<div className="stack horizontal xs">
					5 <Vote />
				</div>
			</MatchBanner>
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
		</MatchBannerContainer>
	);
}

function SendouQMatchTabs() {
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
				canEditSubbedOut={[true, false]}
				onSubbedOutChange={(teamId, subbedOut) => {
					logger.info("onSubbedOutChange", { teamId, subbedOut });
				}}
				teams={[
					{
						team: {
							id: 1,
							name: "me in japan",
							url: "/t/me-in-japan",
						},
						members: [
							{
								id: 1,
								username: "Sendou",
								discordId: "123",
								discordAvatar: null,
								customUrl: "sendou",
							},
							{
								id: 2,
								username: "Lean",
								discordId: "456",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 3,
								username: "Kiver",
								discordId: "789",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 4,
								username: "Brian",
								discordId: "012",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 9,
								username: "Poppy",
								discordId: "567",
								discordAvatar: null,
								customUrl: null,
							},
						],
						subbedOut: [9],
					},
					{
						team: {
							id: 2,
							name: "Question Mark",
							url: "/t/question-mark",
						},
						members: [
							{
								id: 5,
								username: "Naga",
								discordId: "345",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 6,
								username: "Grey",
								discordId: "678",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 7,
								username: "Zack",
								discordId: "901",
								discordAvatar: null,
								customUrl: null,
							},
							{
								id: 8,
								username: "Lime",
								discordId: "234",
								discordAvatar: null,
								customUrl: null,
							},
						],
					},
				]}
			/>
			<MatchActionTab
				teams={[
					{ id: 1, name: "Chimera" },
					{ id: 2, name: "Koopa Clan" },
				]}
				ownTeamId={1}
				stageId={4}
				mode="SZ"
				withPoints={false}
			/>
		</MatchTabs>
	);
}
