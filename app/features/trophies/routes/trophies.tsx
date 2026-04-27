import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	type MetaFunction,
	NavLink,
	Outlet,
	useLoaderData,
} from "react-router";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BADGES_PAGE, navIconUrl, TROPHIES_PAGE } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import { Trophy, TrophyContextProvider } from "../components/Trophy";
import { loader } from "../loaders/trophies.server";
import { useProgressiveRender } from "../trophies-utils";
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
					<div className={styles.trophiesList}>
						<TrophyContextProvider>
							{filteredTrophies.map((trophy, i) =>
								i < visibleCount ? (
									<NavLink to={String(trophy.id)} key={trophy.id}>
										<Trophy
											className={styles.trophy}
											model={trophy.model}
											tier={trophy.tier}
											tentativeTier={trophy.tentativeTier}
											preview
										/>
									</NavLink>
								) : (
									<div key={trophy.id} className={styles.placeholder} />
								),
							)}
						</TrophyContextProvider>
					</div>
				</div>
				<p className={styles.badgesLink}>
					{t("trophies:lookingForBadges")}{" "}
					<Link to={BADGES_PAGE}>{t("trophies:viewBadges")}</Link>
				</p>
			</div>
		</Main>
	);
}
