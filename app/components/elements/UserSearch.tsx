import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import {
	Button,
	Input,
	type Key,
	ListBox,
	ListBoxItem,
	Popover,
	SearchField,
	Select,
	type SelectProps,
	SelectValue,
} from "react-aria-components";
import { Autocomplete } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { CrossIcon } from "~/components/icons/Cross";
import type { UserSearchLoaderData } from "~/features/user-search/loaders/u.server";
import { Avatar } from "../Avatar";
import { SearchIcon } from "../icons/Search";

import selectStyles from "./Select.module.css";
import userSearchStyles from "./UserSearch.module.css";

type UserSearchUserItem = NonNullable<UserSearchLoaderData>["users"][number];

interface UserSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	initialUserId?: number;
	onChange?: (user: UserSearchUserItem) => void;
}

export const UserSearch = React.forwardRef(function UserSearch<
	T extends object,
>(
	{
		name,
		label,
		bottomText,
		errorText,
		initialUserId,
		onChange,
		...rest
	}: UserSearchProps<T>,
	ref?: React.Ref<HTMLButtonElement>,
) {
	const [selectedKey, setSelectedKey] = React.useState(initialUserId ?? null);
	const { initialUser, ...list } = useUserSearch(setSelectedKey, initialUserId);

	const onSelectionChange = (userId: number) => {
		setSelectedKey(userId);
		onChange?.(
			list.items.find((user) => user.id === userId) as UserSearchUserItem,
		);
	};

	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={selectedKey}
			onSelectionChange={onSelectionChange as (key: Key) => void}
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<Button className={selectStyles.button} ref={ref}>
				<SelectValue className={userSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={selectStyles.icon} />
				</span>
			</Button>
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover className={clsx(selectStyles.popover, userSearchStyles.popover)}>
				<Autocomplete
					inputValue={list.filterText}
					onInputChange={list.setFilterText}
				>
					<SearchField
						aria-label="Search"
						autoFocus
						className={selectStyles.searchField}
					>
						<SearchIcon aria-hidden className={selectStyles.smallIcon} />
						<Input
							className={clsx("plain", selectStyles.searchInput)}
							data-testid="user-search-input"
						/>
						<Button className={selectStyles.searchClearButton}>
							<CrossIcon className={selectStyles.smallIcon} />
						</Button>
					</SearchField>
					<ListBox
						items={[initialUser, ...list.items].filter(
							(user) => user !== undefined,
						)}
						className={selectStyles.listBox}
					>
						{(item) => <UserItem item={item as UserSearchUserItem} />}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
});

function UserItem({
	item,
}: {
	item:
		| UserSearchUserItem
		| {
				id: "NO_RESULTS";
		  }
		| {
				id: "PLACEHOLDER";
		  };
}) {
	const { t } = useTranslation(["common"]);

	// for some reason the `renderEmptyState` on ListBox is not working
	// so doing this as a workaround
	if (typeof item.id === "string") {
		return (
			<ListBoxItem
				id="PLACEHOLDER"
				textValue="PLACEHOLDER"
				isDisabled
				className={userSearchStyles.placeholder}
			>
				{item.id === "PLACEHOLDER"
					? t("common:forms.userSearch.placeholder")
					: t("common:forms.userSearch.noResults")}
			</ListBoxItem>
		);
	}

	const additionalText = () => {
		const plusServer = item.plusTier ? `+${item.plusTier}` : "";
		const profileUrl = item.customUrl ? `/u/${item.customUrl}` : "";

		if (plusServer && profileUrl) {
			return `${plusServer} • ${profileUrl}`;
		}

		if (plusServer) {
			return plusServer;
		}

		if (profileUrl) {
			return profileUrl;
		}

		return "";
	};

	return (
		<ListBoxItem
			id={item.id}
			textValue={item.username}
			className={({ isFocused, isSelected }) =>
				clsx(userSearchStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
			data-testid="user-search-item"
		>
			<Avatar user={item} size="xxs" />
			<div className={userSearchStyles.itemTextsContainer}>
				{item.username}
				{additionalText() ? (
					<div className={userSearchStyles.itemAdditionalText}>
						{additionalText()}
					</div>
				) : null}
			</div>
		</ListBoxItem>
	);
}

function useUserSearch(
	setSelectedKey: (userId: number | null) => void,
	initialUserId?: number,
) {
	const [filterText, setFilterText] = React.useState("");

	const queryFetcher = useFetcher<UserSearchLoaderData>();
	const initialUserFetcher = useFetcher<UserSearchLoaderData>();

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
		if (initialUserId !== undefined) {
			setSelectedKey(initialUserId);
		}
	}, [initialUserId, setSelectedKey]);

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(`/u?q=${filterText}&limit=6`);
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	const items = () => {
		// data fetched for the query user has currently typed
		if (queryFetcher.data && queryFetcher.data.query === filterText) {
			if (queryFetcher.data.users.length === 0) {
				return [{ id: "NO_RESULTS" }];
			}
			return queryFetcher.data.users;
		}

		return [{ id: "PLACEHOLDER" }];
	};

	const initialUser = initialUserFetcher.data?.users[0];

	return {
		filterText,
		setFilterText,
		items: items(),
		initialUser,
	};
}
