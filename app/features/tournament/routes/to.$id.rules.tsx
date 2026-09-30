import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Image } from "~/components/Image";
import { containerClassName } from "~/components/Main";
import { MapPoolStages } from "~/components/MapPoolSelector";
import { Section } from "~/components/Section";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapsPageWithMapPool } from "~/features/map-list-generator/map-list-generator-urls";
import { useTournament } from "~/features/tournament/tournament-context";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl } from "~/utils/urls";
import { MarkdownSection } from "../components/MarkdownSection";
import { loader } from "../loaders/to.$id.rules.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["tournament", "calendar", "game-misc"],
};

export default function TournamentRulesPage() {
	const { rules } = useLoaderData<typeof loader>();

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{rules ? <MarkdownSection>{rules}</MarkdownSection> : null}
			<OrganizerMapPool />
			<TeamPickRules />
		</div>
	);
}

function OrganizerMapPool() {
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

function TeamPickRules() {
	const { t } = useTranslation(["tournament", "game-misc"]);
	const tournament = useTournament();
	const teamPick = tournament.teamPickSettings;

	if (!teamPick) return null;

	const picks = teamPick.modes
		.map(({ mode, count }) => `${count}× ${t(`game-misc:MODE_SHORT_${mode}`)}`)
		.join(", ");

	return (
		<div className="text-sm text-lighter text-semi-bold stack xs">
			<div>{t("tournament:rules.teamPick.picks", { picks })}</div>
			<div>{t(`tournament:rules.teamPick.pool.${teamPick.pool}`)}</div>
			<div>{t("tournament:rules.teamPick.neutral")}</div>
			{teamPick.modes.length > 1 ? (
				<div>
					{t("tournament:rules.teamPick.stageRepeat", {
						cap: tournament.stageRepeatCap,
					})}
				</div>
			) : null}
		</div>
	);
}
