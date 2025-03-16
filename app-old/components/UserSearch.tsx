import { Combobox } from "@headlessui/react";
import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import type { UserSearchLoaderData } from "~/features/user-search/routes/u";
import { Avatar } from "./Avatar";

type UserSearchUserItem = NonNullable<UserSearchLoaderData>["users"][number];

export const UserSearch = React.forwardRef<
	HTMLInputElement,
	{
		inputName?: string;
		onChange?: (user: UserSearchUserItem) => void;
		initialUserId?: number;
		id?: string;
		className?: string;
		userIdsToOmit?: Set<number>;
		required?: boolean;
		onBlur?: React.FocusEventHandler<HTMLInputElement>;
	}
>(
	(
		{
			inputName,
			onChange,
			initialUserId,
			id,
			className,
			userIdsToOmit,
			required,
			onBlur,
		},
		ref,
	) => {
		const { t } = useTranslation();
		const [selectedUser, setSelectedUser] =
			React.useState<UserSearchUserItem | null>(null);
		const queryFetcher = useFetcher<UserSearchLoaderData>();
		const initialUserFetcher = useFetcher<UserSearchLoaderData>();
		const [query, setQuery] = React.useState("");

		useDebounce(
			() => {
				if (!query) return;
				queryFetcher.load(`/u?q=${query}&limit=6`);
			},
			1000,
			[query],
		);

		React.useEffect(() => {
			if (
				!initialUserId ||
				initialUserFetcher.state !== "idle" ||
				initialUserFetcher.data
			) {
				return;
			}
			initialUserFetcher.load(`/u?q=${initialUserId}`);
		}, [initialUserId, initialUserFetcher]);

		React.useEffect(() => {
			if (!initialUserFetcher.data) return;
			setSelectedUser(initialUserFetcher.data.users[0]);
		}, [initialUserFetcher.data]);

		const allUsers = queryFetcher.data?.users ?? [];
		const users = allUsers.filter((u) => !userIdsToOmit?.has(u.id));
		const noMatches = queryFetcher.data && users.length === 0;
		const initialSelectionIsLoading = Boolean(
			initialUserId && !initialUserFetcher.data,
		);

		return (
			<div className="combobox-wrapper">
				{selectedUser && inputName ? (
					<input type="hidden" name={inputName} value={selectedUser.id} />
				) : null}
				<Combobox
					value={selectedUser}
					onChange={(newUser) => {
						setSelectedUser(newUser);
						onChange?.(newUser!);
					}}
					disabled={initialSelectionIsLoading}
				>
					<Combobox.Input
						ref={ref}
						placeholder={
							initialSelectionIsLoading
								? t("actions.loading")
								: "Search via name or ID..."
						}
						onChange={(event) => setQuery(event.target.value)}
						displayValue={(user: UserSearchUserItem) => user?.username ?? ""}
						className={clsx("combobox-input", className)}
						data-1p-ignore
						data-testid={`${inputName}-combobox-input`}
						id={id}
						required={required}
						onBlur={onBlur}
					/>
					<Combobox.Options
						className={clsx("combobox-options", {
							empty: noMatches,
							hidden: !queryFetcher.data,
						})}
					>
						{noMatches ? (
							<div className="combobox-no-matches">
								{t("forms.errors.noSearchMatches")}{" "}
								<span className="combobox-emoji">🤔</span>
							</div>
						) : null}
						{users.map((user, i) => (
							<Combobox.Option key={user.id} value={user} as={React.Fragment}>
								{({ active }) => (
									<li
										className={clsx("combobox-item", { active })}
										data-testid={`combobox-option-${i}`}
									>
										<Avatar user={user} size="xs" />
										<div>
											<div className="stack xs horizontal items-center">
												<span className="combobox-username">
													{user.username}
												</span>{" "}
												{user.plusTier ? (
													<span className="text-xxs">+{user.plusTier}</span>
												) : null}
											</div>
											{user.discordUniqueName ? (
												<div className="text-xs">{user.discordUniqueName}</div>
											) : null}
										</div>
									</li>
								)}
							</Combobox.Option>
						))}
					</Combobox.Options>
				</Combobox>
			</div>
		);
	},
);
