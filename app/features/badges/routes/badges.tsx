import type { SerializeFrom } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { Divider } from "~/components/Divider";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { SearchIcon } from "~/components/icons/Search";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BADGES_DOC_LINK, BADGES_PAGE, navIconUrl } from "~/utils/urls";
import * as BadgeRepository from "../BadgeRepository.server";

import "~/styles/badges.css";

export const handle: SendouRouteHandle = {
	i18n: "badges",
	breadcrumb: () => ({
		imgPath: navIconUrl("badges"),
		href: BADGES_PAGE,
		type: "IMAGE",
	}),
};

export type BadgesLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	return { badges: await BadgeRepository.all() };
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
			<div className="badges__container">
				<Outlet />
				<Input
					className="badges-search__input"
					icon={<SearchIcon className="badges-search__icon" />}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
				/>
				{ownBadges.length > 0 ? (
					<div className="w-full">
						<Divider smallText>{t("badges:own.divider")}</Divider>
						<div className="badges__small-badges">
							{ownBadges.map((badge) => (
								<NavLink
									className="badges__nav-link"
									key={badge.id}
									to={String(badge.id)}
								>
									<Badge badge={badge} size={64} isAnimated={false} />
								</NavLink>
							))}
						</div>
					</div>
				) : null}
				<div className="w-full">
					<div className="badges__small-badges">
						{ownBadges.length > 0 ? (
							<Divider smallText>{t("badges:other.divider")}</Divider>
						) : null}
						{otherBadges.map((badge) => (
							<NavLink
								className="badges__nav-link"
								key={badge.id}
								to={String(badge.id)}
							>
								<Badge badge={badge} size={64} isAnimated={false} />
							</NavLink>
						))}
					</div>
				</div>
			</div>
			<div className="badges__general-info-texts">
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
		if (user && badge.managers.includes(user?.id)) {
			ownBadges.push(badge);
		} else {
			otherBadges.push(badge);
		}
	}

	return { ownBadges, otherBadges };
}
