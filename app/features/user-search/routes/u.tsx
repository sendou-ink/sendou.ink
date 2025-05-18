import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { DiscordIcon } from "~/components/icons/Discord";
import { SearchIcon } from "~/components/icons/Search";
import { useUser } from "~/features/auth/core/user";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LOG_IN_URL,
	USER_SEARCH_PAGE,
	navIconUrl,
	userPage,
} from "~/utils/urls";

import { loader } from "../loaders/u.server";
export { loader };

import "~/styles/u.css";

export const handle: SendouRouteHandle = {
	i18n: ["user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("u"),
		href: USER_SEARCH_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "User Search",
		description: "Search for sendou.ink users",
		location: args.location,
	});
};

export default function UserSearchPage() {
	const { t } = useTranslation(["user"]);
	const [searchParams, setSearchParams] = useSearchParams();
	const [inputValue, setInputValue] = React.useState(
		searchParams.get("q") ?? "",
	);
	const user = useUser();

	useDebounce(
		() => {
			if (!inputValue) return;

			setSearchParams({ q: inputValue });
		},
		1500,
		[inputValue],
	);

	if (!user) {
		return (
			<Main className="text-lg font-semi-bold text-center">
				<p>{t("user:search.pleaseLogIn.header")}</p>
				<form
					className="stack items-center mt-6"
					action={LOG_IN_URL}
					method="post"
				>
					<Button size="big" type="submit" icon={<DiscordIcon />}>
						{t("user:search.pleaseLogIn.button")}
					</Button>
				</form>
			</Main>
		);
	}

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
