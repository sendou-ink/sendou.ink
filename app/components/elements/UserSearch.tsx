import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";
import {
	Autocomplete,
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
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useDebounce } from "react-use";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { Avatar } from "../Avatar";

import selectStyles from "./Select.module.css";
import userSearchStyles from "./UserSearch.module.css";

type UserResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "user" }
>;

interface UserSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	initialUserId?: number;
	onChange?: (user: UserResult | null) => void;
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
	const { initialUser, items, ...list } = useUserSearch(
		setSelectedKey,
		initialUserId,
	);

	const onSelectionChange = (userId: number) => {
		setSelectedKey(userId);
		onChange?.(items.find((user) => user.id === userId) as UserResult);
	};

	// clear if selected user is not in the new filtered items
	React.useEffect(() => {
		if (
			selectedKey &&
			selectedKey !== initialUserId &&
			!items.some((user) => user.id === selectedKey)
		) {
			setSelectedKey(null);
			onChange?.(null);
		}
	}, [items, selectedKey, onChange, initialUserId]);

	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={selectedKey}
			onSelectionChange={onSelectionChange as (key: Key | null) => void}
			aria-label="User search"
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<Button className={selectStyles.button} ref={ref}>
				<SelectValue className={userSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronsUpDown className={selectStyles.icon} />
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
						<Search aria-hidden className={selectStyles.icon} />
						<Input
							className={selectStyles.searchInput}
							data-testid="user-search-input"
						/>
						<Button className={selectStyles.searchClearButton}>
							<X className={selectStyles.icon} />
						</Button>
					</SearchField>
					<ListBox
						items={[initialUser, ...items].filter((user) => user !== undefined)}
						className={selectStyles.listBox}
					>
						{(item) => <UserItem item={item as UserResult} />}
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
		| UserResult
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
			textValue={item.name}
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
				{item.name}
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

	const queryFetcher = useFetcher<SearchLoaderData>();
	const initialUserFetcher = useFetcher<SearchLoaderData>();

	React.useEffect(() => {
		if (
			!initialUserId ||
			initialUserFetcher.state !== "idle" ||
			initialUserFetcher.data
		) {
			return;
		}
		initialUserFetcher.load(`/search?q=${initialUserId}&type=users&limit=1`);
	}, [initialUserId, initialUserFetcher]);

	React.useEffect(() => {
		if (initialUserId !== undefined) {
			setSelectedKey(initialUserId);
		}
	}, [initialUserId, setSelectedKey]);

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(`/search?q=${filterText}&type=users&limit=6`);
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	const items = () => {
		// data fetched for the query user has currently typed
		if (queryFetcher.data && queryFetcher.data.query === filterText) {
			const userResults = queryFetcher.data.results.filter(
				(r): r is UserResult => r.type === "user",
			);
			if (userResults.length === 0) {
				return [{ id: "NO_RESULTS" as const }];
			}
			return userResults;
		}

		return [{ id: "PLACEHOLDER" as const }];
	};

	const initialUserResult = initialUserFetcher.data?.results.find(
		(r): r is UserResult => r.type === "user",
	);

	return {
		filterText,
		setFilterText,
		items: items(),
		initialUser: initialUserResult,
	};
}
