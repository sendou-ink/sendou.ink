import clsx from "clsx";
import * as React from "react";
import { ListBoxItem, type SelectProps } from "react-aria-components";
import { useFetcher } from "react-router";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { Avatar } from "../Avatar";
import { SearchSelect } from "./SearchSelect";
import searchSelectStyles from "./SearchSelect.module.css";
import selectStyles from "./Select.module.css";
import { useEntitySearch } from "./useEntitySearch";

export type UserSearchResult = Extract<
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
	onChange?: (user: UserSearchResult | null) => void;
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
	const initialUser = useInitialUser(initialUserId);

	const search = useEntitySearch<UserSearchResult>({
		buildUrl: (query) => `/search?q=${query}&type=users&limit=6`,
		parseResults: (data, query) => parseUserResults(data, query, initialUser),
		initialItem: initialUser,
		initialSelectedId: initialUserId,
		onChange,
	});

	return (
		<SearchSelect
			{...rest}
			name={name}
			label={label}
			bottomText={bottomText}
			errorText={errorText}
			ariaLabel="User search"
			inputTestId="user-search-input"
			inputClassName="in-container"
			i18nKey="userSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <UserItem item={item} />}
		/>
	);
});

function parseUserResults(
	data: unknown,
	query: string,
	initialUser?: UserSearchResult,
): UserSearchResult[] | null {
	const searchData = data as SearchLoaderData;
	if (!searchData || searchData.query !== query) return null;
	return searchData.results
		.filter((result): result is UserSearchResult => result.type === "user")
		.filter((user) => user.id !== initialUser?.id);
}

/** Resolves the full user object for a preselected id so it can be displayed. */
function useInitialUser(initialUserId?: number) {
	const fetcher = useFetcher<SearchLoaderData>();

	React.useEffect(() => {
		if (!initialUserId || fetcher.state !== "idle" || fetcher.data) {
			return;
		}
		fetcher.load(`/search?q=${initialUserId}&type=users&limit=1`);
	}, [initialUserId, fetcher]);

	return fetcher.data?.results.find(
		(result): result is UserSearchResult => result.type === "user",
	);
}

function UserItem({ item }: { item: UserSearchResult }) {
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
				clsx(searchSelectStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
			data-testid="user-search-item"
		>
			<Avatar user={item} size="xxs" />
			<div className={searchSelectStyles.itemTextsContainer}>
				{item.name}
				{additionalText() ? (
					<div className={searchSelectStyles.itemAdditionalText}>
						{additionalText()}
					</div>
				) : null}
			</div>
		</ListBoxItem>
	);
}
