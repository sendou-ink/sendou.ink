import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { useUser } from "~/features/auth/core/user";
import { getUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { type SendouRouteHandle, notFoundIfFalsy } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import {
	USER_SEARCH_PAGE,
	navIconUrl,
	userArtPage,
	userBuildsPage,
	userEditProfilePage,
	userPage,
	userResultsPage,
	userSeasonsPage,
	userVodsPage,
} from "~/utils/urls";

import "~/styles/u.css";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	if (!data) return [];

	return [{ title: makeTitle(data.user.username) }];
};

export const handle: SendouRouteHandle = {
	i18n: "user",
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

export type UserPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(
			params.identifier!,
			loggedInUser?.id,
		),
	);

	return {
		user: {
			...user,
			css: undefined,
		},
		css: user.css,
	};
};

export default function UserPageLayout() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const location = useLocation();
	const { t } = useTranslation(["common", "user"]);

	const isOwnPage = data.user.id === user?.id;

	const allResultsCount =
		data.user.calendarEventResultsCount + data.user.tournamentResultsCount;

	return (
		<Main bigger={location.pathname.includes("results")}>
			<SubNav>
				<SubNavLink to={userPage(data.user)}>
					{t("common:header.profile")}
				</SubNavLink>
				<SubNavLink to={userSeasonsPage({ user: data.user })}>
					{t("user:seasons")}
				</SubNavLink>
				{isOwnPage && (
					<SubNavLink to={userEditProfilePage(data.user)} prefetch="intent">
						{t("common:actions.edit")}
					</SubNavLink>
				)}
				{allResultsCount > 0 && (
					<SubNavLink to={userResultsPage(data.user)}>
						{t("common:results")} ({allResultsCount})
					</SubNavLink>
				)}
				{data.user.buildsCount > 0 && (
					<SubNavLink
						to={userBuildsPage(data.user)}
						prefetch="intent"
						data-testid="builds-tab"
					>
						{t("common:pages.builds")} ({data.user.buildsCount})
					</SubNavLink>
				)}
				{data.user.vodsCount > 0 && (
					<SubNavLink to={userVodsPage(data.user)}>
						{t("common:pages.vods")} ({data.user.vodsCount})
					</SubNavLink>
				)}
				{data.user.artCount > 0 && (
					<SubNavLink to={userArtPage(data.user)} end={false}>
						{t("common:pages.art")} ({data.user.artCount})
					</SubNavLink>
				)}
			</SubNav>
			<Outlet />
		</Main>
	);
}
