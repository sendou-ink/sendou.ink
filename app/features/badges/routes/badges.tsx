import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, Outlet, useLoaderData } from "react-router";
import { Badge } from "~/components/Badge";
import { Divider } from "~/components/Divider";
import { EmptyState } from "~/components/EmptyState";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BADGES_DOC_LINK,
	BADGES_PAGE,
	badgePage,
	navIconUrl,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import * as BadgeListing from "../core/BadgeListing";
import { loader } from "../loaders/badges.server";
import styles from "./badges.module.css";

export { loader };

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
			"Full list of Splatoon tournament prize badges. Check out every badge along with its owners.",
	});
};

export default function BadgesPageLayout() {
	const { t } = useTranslation(["badges", "common"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const [inputValue, setInputValue] = React.useState("");

	const { managed: ownBadges, other: otherBadges } = BadgeListing.split(
		data.badges,
		{ viewerId: user?.id, search: inputValue },
	);

	return (
		<Main>
			<div className={styles.container}>
				<Outlet />
				<Input
					type="search"
					className={styles.searchInput}
					icon={<Search />}
					aria-label={t("common:actions.search")}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
				/>
				{ownBadges.length > 0 ? (
					<div className="w-full" data-testid="managed-badges">
						<Divider smallText>{t("badges:own.divider")}</Divider>
						<div className={styles.smallBadges}>
							{ownBadges.map((badge) => (
								<Link key={badge.id} to={badgePage(badge.id)} prefetch="intent">
									<Badge badge={badge} size={64} isAnimated={false} />
								</Link>
							))}
						</div>
					</div>
				) : null}
				{ownBadges.length > 0 || otherBadges.length > 0 ? (
					<div className="w-full" data-testid="other-badges">
						<div className={styles.smallBadges}>
							{ownBadges.length > 0 ? (
								<Divider smallText>{t("badges:other.divider")}</Divider>
							) : null}
							{otherBadges.map((badge) => (
								<Link key={badge.id} to={badgePage(badge.id)} prefetch="intent">
									<Badge badge={badge} size={64} isAnimated={false} />
								</Link>
							))}
						</div>
					</div>
				) : (
					<EmptyState navItem="badges">{t("badges:noBadgesFound")}</EmptyState>
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
