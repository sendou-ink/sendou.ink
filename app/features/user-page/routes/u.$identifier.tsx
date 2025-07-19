import type { MetaFunction } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { useUser } from "~/features/auth/core/user";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	USER_SEARCH_PAGE,
	userAdminPage,
	userArtPage,
	userBuildsPage,
	userEditProfilePage,
	userPage,
	userResultsPage,
	userSeasonsPage,
	userVodsPage,
} from "~/utils/urls";

import {
	loader,
	type UserPageLoaderData,
} from "../loaders/u.$identifier.server";
export { loader };

import "~/styles/u.css";

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: args.data.user.username,
		description: `${args.data.user.username}'s profile on sendou.ink including builds, tournament results, art and more.`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["user", "badges"],
	breadcrumb: ({ match }) => {
		const data = match.data as UserPageLoaderData | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("u"),
				href: USER_SEARCH_PAGE,
				type: "IMAGE",
			},
			{
				text: data.user.username,
				href: userPage(data.user),
				type: "TEXT",
			},
		];
	},
};

export default function UserPageLayout() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const location = useLocation();
	const { t } = useTranslation(["common", "user"]);

	const isOwnPage = data.user.id === user?.id;

	const allResultsCount =
		data.user.calendarEventResultsCount + data.user.tournamentResultsCount;

	return (
		<Main bigger={location.pathname.includes("results")}>
			<SubNav>
				<SubNavLink to={userPage(data.user)} data-testid="user-profile-tab">
					{t("common:header.profile")}
				</SubNavLink>
				<SubNavLink
					to={userSeasonsPage({ user: data.user })}
					data-testid="user-seasons-tab"
				>
					{t("user:seasons")}
				</SubNavLink>
				{isOwnPage ? (
					<SubNavLink
						to={userEditProfilePage(data.user)}
						prefetch="intent"
						data-testid="user-edit-tab"
					>
						{t("common:actions.edit")}
					</SubNavLink>
				) : null}
				{allResultsCount > 0 ? (
					<SubNavLink
						to={userResultsPage(data.user)}
						data-testid="user-results-tab"
					>
						{t("common:results")} ({allResultsCount})
					</SubNavLink>
				) : null}
				{data.user.buildsCount > 0 || isOwnPage ? (
					<SubNavLink
						to={userBuildsPage(data.user)}
						prefetch="intent"
						data-testid="user-builds-tab"
					>
						{t("common:pages.builds")} ({data.user.buildsCount})
					</SubNavLink>
				) : null}
				{data.user.vodsCount > 0 || isOwnPage ? (
					<SubNavLink to={userVodsPage(data.user)} data-testid="user-vods-tab">
						{t("common:pages.vods")} ({data.user.vodsCount})
					</SubNavLink>
				) : null}
				{data.user.artCount > 0 || isOwnPage ? (
					<SubNavLink
						to={userArtPage(data.user)}
						end={false}
						data-testid="user-art-tab"
					>
						{t("common:pages.art")} ({data.user.artCount})
					</SubNavLink>
				) : null}
				{isStaff ? (
					<SubNavLink
						to={userAdminPage(data.user)}
						data-testid="user-admin-tab"
					>
						Admin
					</SubNavLink>
				) : null}
			</SubNav>
			<Outlet />
		</Main>
	);
}
