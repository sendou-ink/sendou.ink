import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useDebounce } from "react-use";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { Input } from "~/components/Input";
import { DiscordIcon } from "~/components/icons/Discord";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LOG_IN_URL,
	navIconUrl,
	USER_SEARCH_PAGE,
	userPage,
} from "~/utils/urls";

import { loader } from "../loaders/u.server";
export { loader };

import styles from "~/features/user-page/user-page.module.css";

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
					<SendouButton size="big" type="submit" icon={<DiscordIcon />}>
						{t("user:search.pleaseLogIn.button")}
					</SendouButton>
				</form>
			</Main>
		);
	}

	return (
		<Main className={styles.searchContainer}>
			<Input
				className={styles.searchInput}
				icon={<Search className={styles.searchIcon} />}
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
		return <div className={styles.searchInfo}>{t("user:search.info")}</div>;
	}

	if (data.users.length === 0) {
		return (
			<div className={styles.searchInfo}>
				{t("user:search.noResults", { query: data.query })}
			</div>
		);
	}

	return (
		<ul className={styles.searchUsers}>
			{data.users.map((user) => {
				return (
					<li key={user.id}>
						<Link to={userPage(user)}>
							<div className={styles.searchUser}>
								<Avatar size="sm" user={user} />
								<div>
									<div>{user.username}</div>
									{user.inGameName ? (
										<div className={styles.searchIgn}>
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
