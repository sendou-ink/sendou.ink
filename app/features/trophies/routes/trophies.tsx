import { CalendarClock, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	type MetaFunction,
	NavLink,
	Outlet,
	useLoaderData,
} from "react-router";
import * as R from "remeda";
import { Divider } from "~/components/Divider";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BADGES_PAGE, navIconUrl, TROPHIES_PAGE } from "~/utils/urls";
import { metaTags, ogPageImage } from "../../../utils/remix";
import {
	Trophy,
	TrophyContextProvider,
	TrophyGrid,
} from "../components/Trophy";
import * as XpTrophy from "../core/XpTrophy";
import { loader } from "../loaders/trophies.server";
import {
	hasUpcomingTournamentSoon,
	useProgressiveRender,
} from "../trophies-utils";
import styles from "./trophies.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: "trophies",
	breadcrumb: () => ({
		imgPath: navIconUrl("trophies"),
		href: TROPHIES_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Trophies",
		ogTitle: "Splatoon trophies for tournaments",
		image: ogPageImage("trophies"),
		location: args.location,
		description:
			"A full list of all trophies that can be won in Splatoon tournaments.",
	});
};

export default function TrophiesPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();

	const [inputValue, setInputValue] = useState("");
	const inputValueNormalized = inputValue.toLowerCase();
	const filteredTrophies = data.trophies.filter((trophy) =>
		trophy.name.toLowerCase().includes(inputValueNormalized),
	);
	const visibleCount = useProgressiveRender(
		filteredTrophies.length,
		inputValue,
	);

	return (
		<Main>
			<div className={styles.mainContent}>
				<Outlet />
				<div className={styles.trophiesListContainer}>
					<Input
						icon={<Search />}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
					/>
					<TrophyGrid>
						<TrophyContextProvider>
							{filteredTrophies.map((trophy, i) => (
								<NavLink to={String(trophy.id)} key={trophy.id}>
									<Trophy
										model={trophy.model}
										tier={trophy.tier}
										tentativeTier={trophy.tentativeTier}
										preview
										deferred={i >= visibleCount}
										pill={
											hasUpcomingTournamentSoon(trophy.upcomingTournamentAt) ? (
												<CalendarClock
													size={16}
													role="img"
													aria-label={t("trophies:details.upcoming")}
												/>
											) : undefined
										}
									/>
								</NavLink>
							))}
						</TrophyContextProvider>
					</TrophyGrid>
				</div>
				<XpTrophiesSection searchValue={inputValueNormalized} />
				<p className={styles.badgesLink}>
					{t("trophies:lookingForBadges")}{" "}
					<Link to={BADGES_PAGE}>{t("trophies:viewBadges")}</Link>
				</p>
			</div>
		</Main>
	);
}

function XpTrophiesSection({ searchValue }: { searchValue: string }) {
	const { t } = useTranslation(["trophies", "common"]);
	const data = useLoaderData<typeof loader>();

	const filteredTrophies = data.xpTrophies.filter((trophy) =>
		trophy.name.toLowerCase().includes(searchValue),
	);
	const visibleCount = useProgressiveRender(
		filteredTrophies.length,
		`xp-${searchValue}`,
	);

	if (filteredTrophies.length === 0) return null;

	const rows = Object.values(
		R.groupBy(
			filteredTrophies.map((trophy, i) => ({ trophy, i })),
			({ trophy }) => XpTrophy.parseCode(trophy.code)?.category ?? "",
		),
	);

	return (
		<section className="stack md" data-testid="xp-trophies">
			<Divider>{t("trophies:xp.title")}</Divider>
			<TrophyContextProvider>
				<div className={styles.xpTrophies}>
					{rows.map((row) => {
						const category = XpTrophy.parseCode(row[0].trophy.code)?.category;
						if (!category) return null;

						return (
							<div key={category} className={styles.xpRow}>
								{row.map(({ trophy, i }) => (
									<NavLink
										to={String(trophy.id)}
										key={trophy.id}
										aria-label={trophy.name}
									>
										<Trophy
											model={trophy.model}
											code={trophy.code}
											preview
											deferred={i >= visibleCount}
										/>
									</NavLink>
								))}
							</div>
						);
					})}
				</div>
			</TrophyContextProvider>
		</section>
	);
}
