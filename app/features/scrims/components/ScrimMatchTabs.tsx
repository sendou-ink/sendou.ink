import { sub } from "date-fns";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import { resolveRoomPass } from "~/components/match-page/utils";
import { useUser } from "~/features/auth/core/user";
import {
	resolveActiveRoomLink,
	useConfirmRoom,
} from "~/features/chat/room-link-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { teamPage } from "~/utils/urls";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";
import { SCRIM } from "../scrims-constants";
import type { ScrimPost } from "../scrims-types";
import { ScrimMatchActionTab } from "./ScrimMatchActionTab";
import { ScrimMatchResultTab } from "./ScrimMatchResultTab";
import { ScrimMatchStatsTab } from "./ScrimMatchStatsTab";

export function ScrimMatchTabs() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const { onConfirmRoom, isConfirming } = useConfirmRoom();

	const acceptedRequest = data.post.requests[0];
	const allMembers = [...data.post.users, ...acceptedRequest.users];

	const activeRoomLink = resolveActiveRoomLink({
		roomLinks: data.roomLinks,
		freshnessCutoff: dateToDatabaseTimestamp(
			sub(new Date(), { minutes: SCRIM.ROOM_LINK_FRESHNESS_MINUTES }),
		),
		viewerUserId: user?.id,
		members: allMembers,
	});

	const tabs = resolveTabs(data);

	return (
		<MatchTabs tabs={tabs}>
			<MatchJoinTab
				{...activeRoomLink}
				onConfirmRoom={onConfirmRoom}
				isConfirming={isConfirming}
				pool={Scrim.resolvePoolCode(data.post.id)}
				pass={resolveRoomPass(data.post.id)}
				showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
			/>
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
			<ScrimMatchResultTab />
			<ScrimMatchStatsTab />
		</MatchTabs>
	);
}

function resolveTabs(data: ReturnType<typeof useLoaderData<typeof loader>>) {
	const tabs: Array<(typeof TAB_KEYS)[keyof typeof TAB_KEYS]> = [
		TAB_KEYS.ROSTERS,
		TAB_KEYS.JOIN,
		TAB_KEYS.ACTION,
	];

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
