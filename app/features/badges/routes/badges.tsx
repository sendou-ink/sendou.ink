import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { NavLink, Outlet, useLoaderData } from "react-router";
import { Badge } from "~/components/Badge";
import { Divider } from "~/components/Divider";
import { Input } from "~/components/Input";
import { SearchIcon } from "~/components/icons/Search";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BADGES_DOC_LINK, BADGES_PAGE, navIconUrl } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import { type BadgesLoaderData, loader } from "../loaders/badges.server";
export { loader };

import styles from "../badges.module.css";

export const handle: SendouRouteHandle = {
	i18n: "badges",
	breadcrumb: () => ({
		imgPath: navIconUrl("badges"),
		href: BADGES_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Badges",
		ogTitle: "Splatoon badges (tournament prizes list)",
		location: args.location,
		description:
			"Over 400 badge tournament prizes and counting! Check out the full list including the owners.",
	});
};

export default function BadgesPageLayout() {
	const { t } = useTranslation(["badges"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const [inputValue, setInputValue] = React.useState("");

	const { ownBadges: allOwnBadges, otherBadges: allOtherBadges } = splitBadges(
		data.badges,
		user,
	);

	const inputValueNormalized = inputValue.toLowerCase();
	const ownBadges = allOwnBadges.filter(
		(b) =>
			!inputValueNormalized ||
			b.displayName.toLowerCase().includes(inputValueNormalized),
	);
	const otherBadges = allOtherBadges.filter(
		(b) =>
			!inputValueNormalized ||
			b.displayName.toLowerCase().includes(inputValueNormalized),
	);

	return (
		<Main>
			<div className={styles.container}>
				<Outlet />
				<Input
					className={styles.searchInput}
					icon={<SearchIcon />}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
				/>
				{ownBadges.length > 0 ? (
					<div className="w-full">
						<Divider smallText>{t("badges:own.divider")}</Divider>
						<div className={styles.smallBadges}>
							{ownBadges.map((badge) => (
								<NavLink
									className={styles.navLink}
									key={badge.id}
									to={String(badge.id)}
								>
									<Badge badge={badge} size={64} isAnimated={false} />
								</NavLink>
							))}
						</div>
					</div>
				) : null}
				{ownBadges.length > 0 || otherBadges.length > 0 ? (
					<div className="w-full">
						<div className={styles.smallBadges}>
							{ownBadges.length > 0 ? (
								<Divider smallText>{t("badges:other.divider")}</Divider>
							) : null}
							{otherBadges.map((badge) => (
								<NavLink
									className={styles.navLink}
									key={badge.id}
									to={String(badge.id)}
								>
									<Badge badge={badge} size={64} isAnimated={false} />
								</NavLink>
							))}
						</div>
					</div>
				) : (
					<div className="text-lg font-bold my-24">
						{t("badges:noBadgesFound")}
					</div>
				)}
			</div>
			<div className={styles.generalInfoTexts}>
				<p>
					<a href={BADGES_DOC_LINK} target="_blank" rel="noopener noreferrer">
						{t("forYourEvent")}
					</a>
				</p>
			</div>
		</Main>
	);
}

function splitBadges(
	badges: BadgesLoaderData["badges"],
	user: ReturnType<typeof useUser>,
) {
	const ownBadges: BadgesLoaderData["badges"] = [];
	const otherBadges: BadgesLoaderData["badges"] = [];

	for (const badge of badges) {
		if (user && badge.permissions.MANAGE.includes(user.id)) {
			ownBadges.push(badge);
		} else {
			otherBadges.push(badge);
		}
	}

	return { ownBadges, otherBadges };
}
