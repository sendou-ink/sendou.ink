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
import type { SearchLoaderData } from "~/features/search/routes/search";
import selectStyles from "./Select.module.css";
import userSearchStyles from "./UserSearch.module.css";

// xxx: this is pretty much the same as the UserSearch component
// we should probably abstract the common stuff into a reusable hook or component

type OrganizationResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "organization" }
>;

interface OrganizationSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	initialOrganizationId?: number;
	onChange?: (organization: OrganizationResult | null) => void;
}

export function OrganizationSearch<T extends object>({
	name,
	initialOrganizationId,
	onChange,
	...rest
}: OrganizationSearchProps<T>) {
	const [selectedKey, setSelectedKey] = React.useState<number | null>(
		initialOrganizationId ?? null,
	);
	const { initialOrganization, items, ...list } = useOrganizationSearch(
		setSelectedKey,
		initialOrganizationId,
	);

	const onSelectionChange = (organizationId: number) => {
		setSelectedKey(organizationId);
		onChange?.(
			items.find((o) => o.id === organizationId) as OrganizationResult,
		);
	};

	const itemsJoined = items.map((o) => o.id).join(",");
	React.useEffect(() => {
		const ids = itemsJoined.split(",").map(Number);

		if (
			selectedKey &&
			selectedKey !== initialOrganizationId &&
			!ids.includes(selectedKey)
		) {
			setSelectedKey(null);
			onChange?.(null);
		}
	}, [itemsJoined, selectedKey, onChange, initialOrganizationId]);

	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={selectedKey}
			onSelectionChange={onSelectionChange as (key: Key | null) => void}
			className={selectStyles.select}
			aria-label="Organization search"
			{...rest}
		>
			<Button className={selectStyles.button}>
				<SelectValue className={userSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronsUpDown className={selectStyles.icon} />
				</span>
			</Button>
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
							className={clsx("in-container", selectStyles.searchInput)}
							data-testid="organization-search-input"
						/>
						<Button className={selectStyles.searchClearButton}>
							<X className={selectStyles.icon} />
						</Button>
					</SearchField>
					<ListBox
						items={[initialOrganization, ...items].filter(
							(o) => o !== undefined,
						)}
						className={selectStyles.listBox}
					>
						{(item) => <OrganizationItem item={item as OrganizationResult} />}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
}

function OrganizationItem({
	item,
}: {
	item: OrganizationResult | { id: "NO_RESULTS" } | { id: "PLACEHOLDER" };
}) {
	const { t } = useTranslation(["common"]);

	if (typeof item.id === "string") {
		return (
			<ListBoxItem
				textValue="PLACEHOLDER"
				isDisabled
				className={userSearchStyles.placeholder}
			>
				{item.id === "PLACEHOLDER"
					? t("common:forms.organizationSearch.placeholder")
					: t("common:forms.organizationSearch.noResults")}
			</ListBoxItem>
		);
	}

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
		>
			<div className={userSearchStyles.itemTextsContainer}>
				{item.name}
				<div className={userSearchStyles.itemAdditionalText}>/{item.slug}</div>
			</div>
		</ListBoxItem>
	);
}

function useOrganizationSearch(
	setSelectedKey: (organizationId: number | null) => void,
	initialOrganizationId?: number,
) {
	const [filterText, setFilterText] = React.useState("");

	const queryFetcher = useFetcher<SearchLoaderData>();
	const initialFetcher = useFetcher<SearchLoaderData>();

	React.useEffect(() => {
		if (
			!initialOrganizationId ||
			initialFetcher.state !== "idle" ||
			initialFetcher.data
		) {
			return;
		}
		initialFetcher.load(
			`/search?q=${initialOrganizationId}&type=organizations&limit=1`,
		);
	}, [initialOrganizationId, initialFetcher]);

	React.useEffect(() => {
		if (initialOrganizationId !== undefined) {
			setSelectedKey(initialOrganizationId);
		}
	}, [initialOrganizationId, setSelectedKey]);

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(`/search?q=${filterText}&type=organizations&limit=6`);
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	const initialOrganizationResult = initialFetcher.data?.results.find(
		(r): r is OrganizationResult => r.type === "organization",
	);

	const items = (): Array<
		OrganizationResult | { id: "NO_RESULTS" } | { id: "PLACEHOLDER" }
	> => {
		if (queryFetcher.data && queryFetcher.data.query === filterText) {
			const results = queryFetcher.data.results
				.filter((r): r is OrganizationResult => r.type === "organization")
				.filter((o) => o.id !== initialOrganizationResult?.id);
			if (results.length === 0) {
				return [{ id: "NO_RESULTS" as const }];
			}
			return results;
		}

		return [{ id: "PLACEHOLDER" as const }];
	};

	return {
		filterText,
		setFilterText,
		items: items(),
		initialOrganization: initialOrganizationResult,
	};
}
