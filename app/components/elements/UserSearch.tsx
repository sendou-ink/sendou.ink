import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import {
	Button,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	SearchField,
	Select,
	SelectValue,
} from "react-aria-components";
import { Autocomplete } from "react-aria-components";
import { useDebounce } from "react-use";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { CrossIcon } from "~/components/icons/Cross";
import type { UserSearchLoaderData } from "~/features/user-search/loaders/u.server";
import { Avatar } from "../Avatar";
import { SearchIcon } from "../icons/Search";

import selectStyles from "./Select.module.css";
import userSearchStyles from "./UserSearch.module.css";

type UserSearchUserItem = NonNullable<UserSearchLoaderData>["users"][number];

interface UserSearchProps {
	label?: string;
	name?: string;
	onChange?: (user: UserSearchUserItem) => void;
	initialUserId?: number;
	className?: string;
	isRequired?: boolean;
	onBlur?: React.FocusEventHandler<HTMLInputElement>;
	disabled?: boolean;
}

// xxx: clear selection when changing the filter text? now user disappears then comes back
// xxx: why is clear button shown always? (also on select) -> check https://react-spectrum.adobe.com/react-aria/examples/searchable-select.html
// xxx: set https://react-spectrum.adobe.com/react-aria/internationalization.html
export function UserSearch({ name, label, isRequired }: UserSearchProps) {
	const list = useUserSearch();

	return (
		<Select name={name} placeholder="" isRequired={isRequired}>
			{label ? <Label>{label}</Label> : null}
			<Button className={selectStyles.button}>
				<SelectValue className={userSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={selectStyles.icon} />
				</span>
			</Button>
			{/* {description && <Text slot="description">{description}</Text>}
			<FieldError>{errorMessage}</FieldError> */}
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
						<Input className={clsx("plain", selectStyles.searchInput)} />
						<Button className={selectStyles.searchClearButton}>
							<CrossIcon className={selectStyles.smallIcon} />
						</Button>
					</SearchField>
					{/** @ts-expect-error xxx: fix types */}
					<ListBox items={list.items} className={selectStyles.listBox}>
						{(item) => <UserItem item={item as UserSearchUserItem} />}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
}

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
		  }
		| {
				id: "LOADING";
		  };
}) {
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
					? "Search users by username, profile URL or Discord ID..."
					: item.id === "LOADING"
						? "Loading..." // xxx: spinner? or same text as PLACEHOLDER?
						: "No users matching your search found"}
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

function useUserSearch() {
	const [filterText, setFilterText] = React.useState("");
	const queryFetcher = useFetcher<UserSearchLoaderData>();

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(`/u?q=${filterText}&limit=6`);
		},
		1000,
		[filterText],
	);

	const items = () => {
		if (queryFetcher.state !== "idle") {
			return [{ id: "LOADING" }];
		}

		// data fetched for the query user has currently typed
		if (queryFetcher.data && queryFetcher.data.query === filterText) {
			if (queryFetcher.data.users.length === 0) {
				return [{ id: "NO_RESULTS" }];
			}
			return queryFetcher.data.users;
		}

		return [{ id: "PLACEHOLDER" }];
	};

	return {
		filterText,
		setFilterText,
		items: items(),
	};
}
