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
import { resolveRoomPass } from "~/components/match-page/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";

export function ScrimMatchBanner() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

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

	const joinPool = Scrim.resolvePoolCode(data.post.id);
	const joinPass = resolveRoomPass(data.post.id);

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
					joinPass={joinPass}
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
				joinPass={joinPass}
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
