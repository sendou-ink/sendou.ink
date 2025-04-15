import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import {
	ComboBox,
	Group,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
} from "react-aria-components";
import { useDebounce } from "react-use";
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
	required?: boolean;
	onBlur?: React.FocusEventHandler<HTMLInputElement>;
	disabled?: boolean;
}

// xxx: fix dropdown only working on bottom click
export function UserSearch(_props: UserSearchProps) {
	const list = useUserSearch();

	return (
		<ComboBox
			items={list.items}
			inputValue={list.filterText}
			onInputChange={list.setFilterText}
		>
			<Label>Assignee</Label>
			<Group className={selectStyles.button}>
				<Input className={clsx("plain", selectStyles.searchInput)} />
				<SearchIcon className={selectStyles.icon} />
			</Group>
			<Popover className={clsx(selectStyles.popover, userSearchStyles.popover)}>
				<ListBox
					className={selectStyles.listBox}
					renderEmptyState={() => <div>test</div>}
				>
					{(item) => <UserItem user={item as UserSearchUserItem} />}
				</ListBox>
			</Popover>
		</ComboBox>
	);
}

function UserItem({ user }: { user: UserSearchUserItem }) {
	return (
		<ListBoxItem
			id={user.id}
			textValue={user.username}
			className={({ isFocused, isSelected }) =>
				clsx(selectStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
		>
			<Avatar user={user} size="xxs" />
			{user.username}
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

	return {
		filterText,
		setFilterText,
		items:
			queryFetcher.data && queryFetcher.data.query === filterText
				? queryFetcher.data.users
				: [],
	};
}
