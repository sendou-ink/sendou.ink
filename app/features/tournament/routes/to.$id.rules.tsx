import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Image } from "~/components/Image";
import { containerClassName } from "~/components/Main";
import { MapPoolStages } from "~/components/MapPoolSelector";
import { Markdown } from "~/components/Markdown";
import { Section } from "~/components/Section";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { mapsPageWithMapPool, navIconUrl } from "~/utils/urls";
import { loader } from "../loaders/to.$id.rules.server";
import { useTournament } from "./to.$id";
import styles from "./to.$id.info.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["tournament", "calendar", "game-misc"],
};

export default function TournamentRulesPage() {
	const { rules } = useLoaderData<typeof loader>();

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{rules ? (
				<section className={styles.description}>
					<Markdown>{rules}</Markdown>
				</section>
			) : null}
			<CounterPickMapPool />
			<TiebreakerMapPool />
		</div>
	);
}

function CounterPickMapPool() {
	const { t } = useTranslation(["calendar"]);
	const tournament = useTournament();

	if (tournament.ctx.toSetMapPool.length === 0) return null;

	const mapPool = new MapPool(tournament.ctx.toSetMapPool);

	return (
		<Section title={t("calendar:forms.mapPool")}>
			<div>
				<MapPoolStages mapPool={mapPool} />
				<div className="stack items-center mt-4">
					<LinkButton to={mapsPageWithMapPool(mapPool)} variant="outlined">
						<Image alt="" path={navIconUrl("maps")} width={22} height={22} />
						{t("calendar:createMapList")}
					</LinkButton>
				</div>
			</div>
		</Section>
	);
}

function TiebreakerMapPool() {
	const { t } = useTranslation(["game-misc"]);
	const tournament = useTournament();

	if (tournament.ctx.tieBreakerMapPool.length === 0) return null;

	return (
		<div className="text-sm text-lighter text-semi-bold">
			Tiebreaker map pool:{" "}
			{tournament.ctx.tieBreakerMapPool
				.sort((a, b) => modesShort.indexOf(a.mode) - modesShort.indexOf(b.mode))
				.map(
					(map) =>
						`${t(`game-misc:MODE_SHORT_${map.mode}`)} ${t(`game-misc:STAGE_${map.stageId}`)}`,
				)
				.join(", ")}
		</div>
	);
}
