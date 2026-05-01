import { Ban, Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Image } from "~/components/Image";
import {
	IconBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { logger } from "~/utils/logger";
import type { SerializeFrom } from "~/utils/remix";
import { mapsPageWithMapPool, navIconUrl } from "~/utils/urls";
import type { loader } from "../loaders/scrims.$id.server";
import type { ScrimPost } from "../scrims-types";

export function ScrimMatchBanner() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	const screenLegal = !data.anyUserPrefersNoScreen;

	if (data.post.canceled) {
		return (
			<MatchBannerContainer>
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

	const hasMaps = data.post.maps || data.tournamentMapPool;

	return (
		<MatchBannerContainer>
			<IconBanner
				icon={<Swords size={32} />}
				header={t("scrims:banner.freeForm.header")}
				subtitle={t("scrims:banner.freeForm.subtitle")}
				screenLegal={screenLegal}
				topRight={
					hasMaps ? (
						<MapsLink
							maps={data.post.maps}
							tournamentMapPool={data.tournamentMapPool}
						/>
					) : undefined
				}
			/>
		</MatchBannerContainer>
	);
}

function MapsLink({
	maps,
	tournamentMapPool,
}: Pick<ScrimPost, "maps"> &
	Pick<SerializeFrom<typeof loader>, "tournamentMapPool">) {
	const mapPool = () => {
		if (tournamentMapPool) return new MapPool(tournamentMapPool);

		if (maps === "SZ") return MapPool.SZ;
		if (maps === "RANKED") return MapPool.ANARCHY;
		if (maps === "ALL") return MapPool.ALL;

		logger.info(`Unknown scrim maps value: ${maps}`);
		return MapPool.ALL;
	};

	return (
		<Link to={mapsPageWithMapPool(mapPool())}>
			<Image
				path={navIconUrl("maps")}
				width={32}
				height={32}
				alt="Generate maplist"
			/>
		</Link>
	);
}
