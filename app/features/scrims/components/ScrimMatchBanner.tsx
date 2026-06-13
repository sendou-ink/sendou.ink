import { sub } from "date-fns";
import { Ban, Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import {
	IconBanner,
	MatchBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerScheduledTime } from "~/components/match-page/MatchBannerScheduledTime";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { useUser } from "~/features/auth/core/user";
import { resolveActiveRoomLink } from "~/features/chat/room-link-utils";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";
import { SCRIM } from "../scrims-constants";

export function ScrimMatchBanner() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();

	const screenLegal = !data.anyUserPrefersNoScreen;

	const topRow = <ScrimMatchBannerTopRow />;

	if (data.post.canceled) {
		return (
			<MatchBannerContainer>
				{topRow}
				<IconBanner
					icon={<Ban size={32} />}
					header={t("scrims:banner.canceled.header", {
						user: data.post.canceled.byUser.username,
					})}
					subtitle={t("scrims:banner.canceled.subtitle", {
						reason: data.post.canceled.reason,
					})}
				/>
			</MatchBannerContainer>
		);
	}

	const acceptedRequest = data.post.requests[0];
	const activeRoomLink = resolveActiveRoomLink({
		roomLinks: data.roomLinks,
		freshnessCutoff: dateToDatabaseTimestamp(
			sub(new Date(), { minutes: SCRIM.ROOM_LINK_FRESHNESS_MINUTES }),
		),
		viewerUserId: user?.id,
		members: [...data.post.users, ...acceptedRequest.users],
	});
	const joinViaQr = Boolean(activeRoomLink.joinLink) && !activeRoomLink.isStale;
	const joinPool = Scrim.resolvePoolCode(data.post.id);

	const currentMap = data.mapByMap.currentMap;

	if (currentMap) {
		return (
			<MatchBannerContainer>
				{topRow}
				<MatchBanner
					stageId={currentMap.stageId}
					mode={currentMap.mode}
					screenLegal={screenLegal}
					joinPool={joinPool}
					joinViaQr={joinViaQr}
				/>
			</MatchBannerContainer>
		);
	}

	return (
		<MatchBannerContainer>
			{topRow}
			<IconBanner
				icon={<Swords size={32} />}
				header={t("scrims:banner.freeForm.header")}
				subtitle={t("scrims:banner.freeForm.subtitle")}
				screenLegal={screenLegal}
				joinPool={joinPool}
				joinViaQr={joinViaQr}
			/>
		</MatchBannerContainer>
	);
}

function ScrimMatchBannerTopRow() {
	const data = useLoaderData<typeof loader>();

	const acceptedRequest = data.post.requests.find((r) => r.isAccepted);
	const scheduledAt = databaseTimestampToDate(
		acceptedRequest?.at ?? data.post.at,
	);

	return (
		<MatchBannerTopRow>
			<MatchBannerScheduledTime time={scheduledAt} />
		</MatchBannerTopRow>
	);
}
