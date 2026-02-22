import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation, useMatches } from "react-router";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { useUser } from "~/features/auth/core/user";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	userAdminPage,
	userArtPage,
	userBuildsPage,
	userEditProfilePage,
	userPage,
	userResultsPage,
	userSeasonsPage,
	userVodsPage,
} from "~/utils/urls";
import type { UserPageNavItem } from "../components/UserPageIconNav";

import {
	loader,
	type UserPageLoaderData,
} from "../loaders/u.$identifier.server";
export { loader };

import "~/features/user-page/user-page.module.css";

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

		return {
			text: data.user.username,
			href: userPage(data.user),
			type: "TEXT",
		};
	},
};

export default function UserPageLayout() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const location = useLocation();
	const { t } = useTranslation(["common", "user"]);
	const matches = useMatches();

	const isOwnPage = data.user.id === user?.id;

	const allResultsCount =
		data.user.calendarEventResultsCount + data.user.tournamentResultsCount;

	const isNewUserPage = matches.some((m) => (m.data as any)?.type === "new");

	const navItems: UserPageNavItem[] = [
		{
			to: userSeasonsPage({ user: data.user }),
			iconName: "sendouq",
			label: t("user:seasons"),
			isVisible: true,
			testId: "user-seasons-tab",
		},
		{
			to: userResultsPage(data.user),
			iconName: "medal",
			label: t("common:results"),
			count: allResultsCount,
			isVisible: allResultsCount > 0,
			testId: "user-results-tab",
		},
		{
			to: userBuildsPage(data.user),
			iconName: "builds",
			label: t("common:pages.builds"),
			count: data.user.buildsCount,
			isVisible: data.user.buildsCount > 0 || isOwnPage,
			testId: "user-builds-tab",
			prefetch: "intent",
		},
		{
			to: userVodsPage(data.user),
			iconName: "vods",
			label: t("common:pages.vods"),
			count: data.user.vodsCount,
			isVisible: data.user.vodsCount > 0 || isOwnPage,
			testId: "user-vods-tab",
		},
		{
			to: userArtPage(data.user),
			iconName: "art",
			label: t("common:pages.art"),
			count: data.user.artCount,
			isVisible: data.user.artCount > 0 || isOwnPage,
			testId: "user-art-tab",
			end: false,
		},
		{
			to: userAdminPage(data.user),
			iconName: "admin",
			label: "Admin",
			isVisible: isStaff,
			testId: "user-admin-tab",
		},
	];

	return (
		<Main bigger={location.pathname.includes("results")}>
			{isNewUserPage ? null : (
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
						<SubNavLink
							to={userVodsPage(data.user)}
							data-testid="user-vods-tab"
						>
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
			)}
			<Outlet context={{ navItems }} />
		</Main>
	);
}
