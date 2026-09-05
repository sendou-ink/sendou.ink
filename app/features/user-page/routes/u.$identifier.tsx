import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	discordAvatarUrl,
	userAdminPage,
	userBuildsPage,
	userPage,
	userResultsPage,
	userVodsPage,
} from "~/utils/urls";
import type { UserPageNavItem } from "../components/UserPageIconNav";

import {
	loader,
	type UserPageLoaderData,
} from "../loaders/u.$identifier.server";

export { loader };

import { userArtPage } from "~/features/art/art-urls";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	return metaTags({
		title: args.loaderData.user.username,
		description: `${args.loaderData.user.username}'s profile on sendou.ink including builds, tournament results, art and more.`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["user", "badges", "game-badges"],
	breadcrumb: ({ match }) => {
		const data = match.loaderData as UserPageLoaderData | undefined;

		if (!data) return [];

		const imgPath = data.user.customAvatarUrl
			? data.user.customAvatarUrl
			: data.user.discordAvatar
				? discordAvatarUrl({
						discordId: data.user.discordId,
						discordAvatar: data.user.discordAvatar,
						size: "sm",
					})
				: null;

		if (!imgPath) {
			return {
				text: data.user.username,
				href: userPage(data.user),
				type: "TEXT",
			};
		}

		return {
			imgPath,
			href: userPage(data.user),
			type: "IMAGE",
			text: data.user.username,
			identiconInput: String(data.user.discordId),
		};
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
			<Outlet context={{ navItems }} />
		</Main>
	);
}
