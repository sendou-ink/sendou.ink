import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import {
	MatchTimeline,
	type TimelineMap,
} from "~/components/match-page/MatchTimeline";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";

export function ScrimMatchResultTab() {
	const { t } = useTranslation(["scrims", "q"]);
	const data = useLoaderData<typeof loader>();

	const acceptedRequest = data.post.requests.find((r) => r.isAccepted);
	const maps = data.mapByMap?.maps ?? [];
	const reportedMaps = maps.filter(
		(m) => m.winnerSide !== null && m.reportedAt !== null,
	);

	if (!acceptedRequest || reportedMaps.length === 0) {
		return (
			<SendouTabPanel id={TAB_KEYS.RESULT}>
				<div>{t("scrims:mapByMap.result.empty")}</div>
			</SendouTabPanel>
		);
	}

	const teams = {
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
	};

	const rosters = {
		alpha: data.post.users,
		bravo: acceptedRequest.users,
	};

	const timelineMaps: TimelineMap[] = reportedMaps.map((map) => ({
		stageId: map.stageId,
		mode: map.mode,
		timestamp: databaseTimestampToJavascriptTimestamp(map.reportedAt!),
		winner: map.winnerSide === "ALPHA" ? "ALPHA" : "BRAVO",
		rosters,
	}));

	const isOngoing = data.mapByMap?.currentMap != null;

	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<MatchTimeline teams={teams} maps={timelineMaps} isOngoing={isOngoing} />
		</SendouTabPanel>
	);
}
