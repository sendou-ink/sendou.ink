import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ModeImage } from "~/components/Image";
import { containerClassName } from "~/components/Main";
import { Markdown } from "~/components/Markdown";
import { TierPill } from "~/components/TierPill";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { removeMarkdown } from "~/utils/strings";
import { tournamentPage } from "~/utils/urls";
import { FactCardGrid, type FactCardItem } from "../components/FactCard";
import { RegistrationActions } from "../components/RegistrationActions";
import {
	TournamentHeader,
	TournamentHeaderActions,
} from "../components/TournamentHeader";
import { loader } from "../loaders/to.$id.info.server";
import { bracketProgressionLabel } from "../tournament-utils";
import { useTournament } from "./to.$id";
import styles from "./to.$id.info.module.css";

export { loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	const tournamentData = JSON.parse(args.matches[1].data as any)?.tournament as
		| TournamentData
		| undefined;
	if (!tournamentData) return [];

	return metaTags({
		title: tournamentData.ctx.name,
		description: args.data?.description
			? removeMarkdown(args.data.description)
			: undefined,
		image: {
			url: tournamentData.ctx.logoUrl,
			dimensions: { width: 124, height: 124 },
		},
		location: args.location,
		url: tournamentPage(tournamentData.ctx.id),
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["tournament"],
};

export default function TournamentInfoPage() {
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const facts = useFacts(tournament);

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			<TournamentHeader tournament={tournament} />
			<div className="stack md">
				<FactCardGrid facts={facts} />
				<TournamentHeaderActions
					tournament={tournament}
					isSaved={data.isSaved}
				/>
			</div>
			<RegistrationActions tournament={tournament} />
			{data.description ? (
				<section className={styles.description}>
					<Markdown>{data.description}</Markdown>
				</section>
			) : null}
		</div>
	);
}

function useFacts(
	tournament: ReturnType<typeof useTournament>,
): FactCardItem[] {
	const { t } = useTranslation(["tournament"]);

	const teamSizeValue =
		tournament.minMembersPerTeam === tournament.maxMembersPerTeam
			? `${tournament.minMembersPerTeam}`
			: `${tournament.minMembersPerTeam}–${tournament.maxMembersPerTeam}`;

	const showsEstimatedTier = !tournament.ctx.tier && !tournament.hasStarted;

	const rankedSeason = Seasons.current(tournament.ctx.startTime);

	return [
		{
			label: t("tournament:fact.format"),
			value: `${tournament.minMembersPerTeam}v${tournament.minMembersPerTeam}`,
		},
		{
			label: t("tournament:fact.bracket"),
			value: bracketProgressionLabel(
				tournament.ctx.settings.bracketProgression,
			),
		},
		{
			label: t("tournament:fact.modes"),
			value: (
				<div className={styles.modes}>
					{tournament.modesIncluded.map((mode) => (
						<ModeImage key={mode} mode={mode} size={20} />
					))}
				</div>
			),
		},
		{
			label: showsEstimatedTier
				? t("tournament:fact.tier.est")
				: t("tournament:fact.tier"),
			value: tournament.ctx.tier ? (
				<TierPill tier={tournament.ctx.tier} />
			) : showsEstimatedTier && tournament.ctx.tentativeTier ? (
				<TierPill tier={tournament.ctx.tentativeTier} isTentative />
			) : (
				"-"
			),
		},
		{
			label: t("tournament:fact.ranked"),
			value:
				tournament.ranked && rankedSeason
					? t("tournament:fact.ranked.yesWithSeason", {
							season: rankedSeason.nth,
						})
					: tournament.ranked
						? t("tournament:fact.ranked.yes")
						: t("tournament:fact.ranked.no"),
		},
		{
			label: t("tournament:fact.teamSize"),
			value: teamSizeValue,
		},
	];
}
