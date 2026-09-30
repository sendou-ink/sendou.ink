import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import type { TimelineMap } from "~/components/match-page/MatchTimeline";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import { teamPage } from "~/utils/urls";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";
import type { ScrimPost } from "../scrims-types";
import { ScrimMatchActionTab } from "./ScrimMatchActionTab";
import { ScrimMatchStatsTab } from "./ScrimMatchStatsTab";

export function ScrimMatchTabs() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	const acceptedRequest = data.post.requests[0];

	const tabs = resolveTabs(data);

	return (
		<MatchTabs tabs={tabs}>
			<MatchRosterTab
				minMembersPerTeam={4}
				teams={[
					{
						team: mapTeam(data.post.team),
						defaultName: t("q:match.groupAlpha"),
						members: data.post.users,
					},
					{
						team: mapTeam(acceptedRequest.team),
						defaultName: t("q:match.groupBravo"),
						members: acceptedRequest.users,
					},
				]}
			/>
			<ScrimMatchActionTab />
			<MatchResultTab
				teams={{
					alpha: {
						name: data.post.team
							? Scrim.sideDisplayName(data.post)
							: t("q:match.groupAlpha"),
						avatar: data.post.team?.avatarUrl ?? undefined,
					},
					bravo: {
						name: acceptedRequest.team
							? Scrim.sideDisplayName(acceptedRequest)
							: t("q:match.groupBravo"),
						avatar: acceptedRequest.team?.avatarUrl ?? undefined,
					},
				}}
				maps={resolveTimelineMaps(data, acceptedRequest)}
				isOngoing={!data.mapByMap?.locked && data.mapByMap?.currentMap !== null}
			/>
			<ScrimMatchStatsTab />
		</MatchTabs>
	);
}

function resolveTabs(data: ReturnType<typeof useLoaderData<typeof loader>>) {
	const tabs: Array<(typeof TAB_KEYS)[keyof typeof TAB_KEYS]> = [
		TAB_KEYS.ROSTERS,
	];

	if (!data.mapByMap?.locked) {
		tabs.push(TAB_KEYS.ACTION);
	}

	if (data.mapByMap && data.mapByMap.maps.length > 0) {
		tabs.push(TAB_KEYS.RESULT);
	}

	if (
		data.mapByMap?.maps.some((m) => m.reportedAt !== null) &&
		data.mapByMap.viewerSide !== null
	) {
		tabs.push(TAB_KEYS.STATS);
	}

	return tabs;
}

function mapTeam(team: ScrimPost["team"]) {
	if (!team) return undefined;
	return {
		id: 0,
		name: team.name,
		url: teamPage(team.customUrl),
		avatar: team.avatarUrl ?? undefined,
	};
}

function resolveTimelineMaps(
	data: ReturnType<typeof useLoaderData<typeof loader>>,
	acceptedRequest: ScrimPost["requests"][number],
): TimelineMap[] {
	const rosters = {
		alpha: data.post.users,
		bravo: acceptedRequest.users,
	};

	return (data.mapByMap?.maps ?? [])
		.filter((m) => m.winnerSide !== null && m.reportedAt !== null)
		.map((map) => ({
			stageId: map.stageId,
			mode: map.mode,
			timestamp: databaseTimestampToJavascriptTimestamp(map.reportedAt!),
			winner: map.winnerSide === "ALPHA" ? "ALPHA" : "BRAVO",
			rosters,
		}));
}
