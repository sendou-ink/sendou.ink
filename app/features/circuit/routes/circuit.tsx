import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { PageHeader } from "~/components/PageHeader";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { CircuitEvent } from "../circuit-types";
import { circuitModesLabel } from "../circuit-utils";
import {
	PastEventCard,
	UpcomingEventCard,
} from "../components/CircuitEventCard";
import { CircuitQuickFacts } from "../components/CircuitQuickFacts";
import {
	CircuitFeaturedLeaderboard,
	CircuitStandings,
} from "../components/CircuitRankings";
import { CircuitTimeline } from "../components/CircuitTimeline";
import { loader } from "../loaders/circuit.server";
import styles from "./circuit.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Circuit",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["circuit"],
};

const UPCOMING_SHOWN_COUNT = 2;

export default function CircuitPage() {
	const { t } = useTranslation(["circuit", "common"]);
	const data = useLoaderData<typeof loader>();

	const upcomingEvents = data.events.filter((event) => !event.result);
	const pastEvents = data.events.filter((event) => event.result).reverse();
	const nextEventId = upcomingEvents.at(0)?.id ?? null;

	return (
		<Main bigger className="stack lg">
			<PageHeader
				title={t("circuit:title")}
				subtitle={t(`circuit:seasons.${data.season}`)}
			/>
			<CircuitTimeline events={data.events} nextEventId={nextEventId} />
			<CircuitQuickFacts />
			<div className={styles.overviewContainer}>
				<div className={styles.overview}>
					<section className={styles.column}>
						<h2 className={styles.sectionTitle}>{t("circuit:upcoming")}</h2>
						<div className={styles.upcomingCards}>
							{upcomingEvents.slice(0, UPCOMING_SHOWN_COUNT).map((event) => (
								<UpcomingEventCard
									key={event.id}
									event={event}
									isNext={event.id === nextEventId}
								/>
							))}
						</div>
						<ShowAllButton />
					</section>
					<section className={styles.column}>
						<h2 className={styles.sectionTitle}>{t("circuit:standings")}</h2>
						<div className={styles.stretchedTable}>
							<CircuitStandings entries={data.standings} />
						</div>
						<ShowAllButton />
					</section>
					<section className={styles.column}>
						<h2 className={styles.sectionTitle}>
							{t("circuit:leaderboards")}
							<span className={styles.sectionSubtitle}>
								{t(`circuit:leaderboards.${data.featuredLeaderboard.type}`)}
							</span>
						</h2>
						<div className={styles.stretchedTable}>
							<CircuitFeaturedLeaderboard
								leaderboard={data.featuredLeaderboard}
							/>
						</div>
						<ShowAllButton />
					</section>
				</div>
			</div>
			{pastEvents.length > 0 ? (
				<section className="stack md">
					<h2 className={styles.sectionTitle}>{t("circuit:past")}</h2>
					{groupByConsecutiveOffMode(pastEvents).map((group) => (
						<div key={group[0].id} className="stack sm">
							{group[0].offMode ? (
								<h3 className={styles.modeTitle}>
									{circuitModesLabel(group[0].offMode)}
								</h3>
							) : null}
							<div className={styles.pastGrid}>
								{group.map((event) => (
									<PastEventCard key={event.id} event={event} />
								))}
							</div>
						</div>
					))}
				</section>
			) : null}
		</Main>
	);
}

function ShowAllButton() {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton variant="ghost" size="small" className="justify-self-center">
			{t("common:actions.showAll")}
			<ArrowRight size={16} className="ml-1" aria-hidden />
		</SendouButton>
	);
}

function groupByConsecutiveOffMode(events: CircuitEvent[]) {
	const groups: CircuitEvent[][] = [];

	for (const event of events) {
		const previous = groups.at(-1);
		if (previous && previous[0].offMode === event.offMode) {
			previous.push(event);
		} else {
			groups.push([event]);
		}
	}

	return groups;
}
