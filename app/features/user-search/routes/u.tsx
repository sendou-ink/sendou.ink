import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { SearchIcon } from "~/components/icons/Search";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	type SendouRouteHandle,
	parseSearchParams,
} from "~/utils/remix.server";
import { USER_SEARCH_PAGE, navIconUrl, userPage } from "~/utils/urls";
import { queryToUserIdentifier } from "~/utils/users";

import "~/styles/u.css";

export const handle: SendouRouteHandle = {
	i18n: ["user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("u"),
		href: USER_SEARCH_PAGE,
		type: "IMAGE",
	}),
};

export type UserSearchLoaderData = SerializeFrom<typeof loader>;

const searchParamsSchema = z.object({
	q: z.string().max(100).default(""),
	limit: z.coerce.number().int().min(1).max(25).default(25),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { q: query, limit } = parseSearchParams({
		request,
		schema: searchParamsSchema,
	});

	if (!query) return null;

	const identifier = queryToUserIdentifier(query);

	return {
		users: identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query, limit }),
		query,
	};
};

export default function UserSearchPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [inputValue, setInputValue] = React.useState(
		searchParams.get("q") ?? "",
	);
	useDebounce(
		() => {
			if (!inputValue) return;

			setSearchParams({ q: inputValue });
		},
		1500,
		[inputValue],
	);

	return (
		<Main className="u-search__container">
			<Input
				className="u-search__input"
				icon={<SearchIcon className="u-search__icon" />}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
			/>
			<UsersList />
		</Main>
	);
}

function UsersList() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	if (!data) {
		return <div className="u-search__info">{t("user:search.info")}</div>;
	}

	if (data.users.length === 0) {
		return (
			<div className="u-search__info">
				{t("user:search.noResults", { query: data.query })}
			</div>
		);
	}

	return (
		<ul className="u-search__users">
			{data.users.map((user) => {
				return (
					<li key={user.id}>
						<Link to={userPage(user)}>
							<div className="u-search__user">
								<Avatar size="sm" user={user} />
								<div>
									<div>{user.username}</div>
									{user.inGameName ? (
										<div className="u-search__ign">
											{t("user:ign.short")}: {user.inGameName}
										</div>
									) : null}
								</div>
							</div>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
