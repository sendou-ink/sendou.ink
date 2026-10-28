import { Search, UserRound } from "lucide-react";
import * as React from "react";
import { useFetcher, useLocation } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { SendouSection } from "~/components/elements/Section";
import { Input } from "~/components/Input";
import { useUser } from "~/features/auth/core/user";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { searchSearchParams } from "~/features/search/search-search-params";
import { useDebounce } from "~/hooks/useDebounce";
import type { DevApp } from "../../dev-tools-types";
import { DEV_IDENTITY_URL, logInAsUrl } from "../../dev-tools-urls";
import type { DevIdentityLoaderData } from "../../routes/dev.identity";
import { DevChip } from "../DevUi";
import styles from "./IdentityApp.module.css";

export const identityDevApp: DevApp = {
	id: "identity",
	title: "Identity",
	description: "Who you are and who else you could be",
	icon: <IdentityIcon />,
	size: "md",
	Component: IdentityApp,
};

const SEARCH_DEBOUNCE_MS = 200;

function IdentityApp() {
	const user = useUser();
	const { load, data } = useFetcher<DevIdentityLoaderData>();
	const location = useLocation();
	const returnTo = `${location.pathname}${location.search}`;

	React.useEffect(() => {
		load(DEV_IDENTITY_URL);
	}, [load]);

	return (
		<div className="stack md">
			<SendouSection title="You">
				{user ? (
					<div className="stack horizontal sm items-center">
						<Avatar user={user} size="xs" />
						<div className="stack xs">
							<span className="font-semi-bold">
								{user.username}{" "}
								<span className="text-xs text-lighter">#{user.id}</span>
							</span>
							<span className={styles.roles}>
								{user.plusTier ? (
									<DevChip tone="accent">+{user.plusTier}</DevChip>
								) : null}
								{user.roles.map((role) => (
									<DevChip key={role} tone="info">
										{role}
									</DevChip>
								))}
								{user.roles.length === 0 && !user.plusTier ? (
									<DevChip>No roles</DevChip>
								) : null}
							</span>
						</div>
					</div>
				) : (
					<p className="text-lighter">Logged out</p>
				)}
				{data?.isImpersonating ? (
					<Alert variation="WARNING" tiny>
						{data.realUser
							? `Impersonating. Really ${data.realUser.username} (#${data.realUser.id}). `
							: "Impersonating without a session of your own. "}
						<a href={logInAsUrl({ userId: null, returnTo })}>
							{data.realUser ? "Back to own account" : "Log out"}
						</a>
					</Alert>
				) : null}
			</SendouSection>

			<SendouSection title="Seeded users">
				<p className="text-xs text-lighter">
					Their ids grant them roles, see QUICK_LOG_IN_USERS
				</p>
				<div className={styles.userGrid}>
					{data?.quickUsers.map((quickUser) => (
						<UserLink
							key={quickUser.id}
							user={quickUser}
							caption={quickUser.label}
							href={logInAsUrl({ userId: quickUser.id, returnTo })}
							isCurrent={quickUser.id === user?.id}
						/>
					))}
				</div>
				{data && data.quickUsers.length === 0 ? (
					<p className="no-results">
						None of them exist, reseed from the Server app
					</p>
				) : null}
			</SendouSection>

			{data && data.scenarioRuns.length > 0 ? (
				<SendouSection title="From scenarios">
					<p className="text-xs text-lighter">
						Opens the page the scenario landed on
					</p>
					<div className={styles.userGrid}>
						{data.scenarioRuns.map((run) => (
							<UserLink
								key={`${run.userId}-${run.ranAt}`}
								user={run.user}
								caption={run.title}
								href={logInAsUrl({ userId: run.userId, returnTo: run.path })}
								isCurrent={run.userId === user?.id}
							/>
						))}
					</div>
				</SendouSection>
			) : null}

			<SendouSection title="Anyone else">
				<UserSearch returnTo={returnTo} />
			</SendouSection>
		</div>
	);
}

function UserLink({
	user,
	caption,
	href,
	isCurrent,
}: {
	user: React.ComponentProps<typeof Avatar>["user"] & {
		id: number;
		username: string;
	};
	caption: string;
	href: string;
	isCurrent: boolean;
}) {
	return (
		<a
			className={styles.userLink}
			href={href}
			aria-current={isCurrent || undefined}
		>
			<Avatar user={user} size="xxs" />
			<span className={styles.userLinkText}>
				<span className="truncate font-semi-bold">
					{user.username}{" "}
					<span className="text-xs text-lighter">#{user.id}</span>
				</span>
				<span className="truncate text-xs text-lighter">{caption}</span>
			</span>
		</a>
	);
}

function UserSearch({ returnTo }: { returnTo: string }) {
	const [query, setQuery] = React.useState("");
	const { load, data } = useFetcher<SearchLoaderData>();

	useDebounce(
		() => {
			if (query.trim()) {
				load(
					searchSearchParams.href("/search", {
						q: query.trim(),
						type: "users",
						limit: 8,
					}),
				);
			}
		},
		SEARCH_DEBOUNCE_MS,
		[query],
	);

	const users =
		query.trim() && data
			? data.results.flatMap((result) =>
					result.type === "user" ? [result] : [],
				)
			: [];

	return (
		<div className="stack sm">
			<Input
				placeholder="Username, Discord id or profile URL"
				aria-label="Search users"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				icon={<Search />}
			/>
			{users.length > 0 ? (
				<div className={styles.userGrid}>
					{users.map((result) => (
						<UserLink
							key={result.id}
							user={{ ...result, username: result.name }}
							caption={result.inGameName ?? `#${result.id}`}
							href={logInAsUrl({ userId: result.id, returnTo })}
							isCurrent={false}
						/>
					))}
				</div>
			) : null}
			{query.trim() && data && users.length === 0 ? (
				<p className="no-results">No users found</p>
			) : null}
		</div>
	);
}

function IdentityIcon() {
	const user = useUser();

	if (!user) return <UserRound />;

	return <Avatar user={user} size="xxxsm" className={styles.toolbarAvatar} />;
}
