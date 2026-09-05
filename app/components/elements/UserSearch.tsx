import * as React from "react";
import { useFetcher } from "react-router";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { Avatar } from "../Avatar";
import {
	SearchSelect,
	type SearchSelectFieldProps,
	SearchSelectItem,
	SearchSelectItemAdditionalText,
} from "./SearchSelect";
import { useEntitySearch } from "./useEntitySearch";

export type UserSearchResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "user" }
>;

interface UserSearchProps extends SearchSelectFieldProps {
	initialUserId?: number;
	onChange?: (user: UserSearchResult | null) => void;
	ref?: React.Ref<HTMLButtonElement>;
}

export function UserSearch({
	initialUserId,
	onChange,
	ref,
	...rest
}: UserSearchProps) {
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
			ariaLabel="User search"
			inputTestId="user-search-input"
			inputClassName="in-container"
			i18nKey="userSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <UserItem item={item} />}
		/>
	);
}

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

/**
 * Resolves the full user object for a preselected id so it can be displayed.
 * Loads at most once per field: later id changes come from the user picking a
 * result, which already carries the full user object.
 */
function useInitialUser(initialUserId?: number) {
	const fetcher = useFetcher<SearchLoaderData>();
	const { load } = fetcher;
	const hasLoadedRef = React.useRef(false);

	React.useEffect(() => {
		if (!initialUserId || hasLoadedRef.current) {
			return;
		}
		hasLoadedRef.current = true;
		load(`/search?q=${initialUserId}&type=users&limit=1`);
	}, [initialUserId, load]);

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
		<SearchSelectItem
			id={item.id}
			textValue={item.name}
			testId="user-search-item"
			leading={<Avatar user={item} size="xxs" />}
		>
			{item.name}
			{additionalText() ? (
				<SearchSelectItemAdditionalText>
					{additionalText()}
				</SearchSelectItemAdditionalText>
			) : null}
		</SearchSelectItem>
	);
}
