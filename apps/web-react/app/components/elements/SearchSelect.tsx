import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import type * as React from "react";
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
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import searchSelectStyles from "./SearchSelect.module.css";
import selectStyles from "./Select.module.css";
import type { EntitySearch } from "./useEntitySearch";

const PLACEHOLDER_TEXTS = {
	organizationSearch: {
		placeholder: "common:forms.organizationSearch.placeholder",
		noResults: "common:forms.organizationSearch.noResults",
	},
	teamSearch: {
		placeholder: "common:forms.teamSearch.placeholder",
		noResults: "common:forms.teamSearch.noResults",
	},
	tournamentSearch: {
		placeholder: "common:forms.tournamentSearch.placeholder",
		noResults: "common:forms.tournamentSearch.noResults",
	},
	userSearch: {
		placeholder: "common:forms.userSearch.placeholder",
		noResults: "common:forms.userSearch.noResults",
	},
} as const;

interface SearchSelectProps<
	TItem extends { id: number; name: string },
	T extends object,
> extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	ariaLabel: string;
	inputTestId: string;
	inputClassName?: string;
	i18nKey: keyof typeof PLACEHOLDER_TEXTS;
	search: EntitySearch<TItem>;
	buttonRef?: React.Ref<HTMLButtonElement>;
	renderItem: (item: TItem) => React.ReactElement;
}

/**
 * Presentational autocomplete select shared by the entity search components
 * (e.g. `UserSearch`, `TeamSearch`, `TournamentSearch`). Wire up data fetching
 * with `useEntitySearch` and pass its result as `search`.
 */
export function SearchSelect<
	TItem extends { id: number; name: string },
	T extends object,
>({
	name,
	label,
	bottomText,
	errorText,
	ariaLabel,
	inputTestId,
	inputClassName,
	i18nKey,
	search,
	buttonRef,
	renderItem,
	...rest
}: SearchSelectProps<TItem, T>) {
	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={search.selectedKey}
			onSelectionChange={(key: Key | null) => {
				if (key != null) {
					search.onSelectionChange(Number(key));
				}
			}}
			className={selectStyles.select}
			aria-label={ariaLabel}
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<Button className={selectStyles.button} ref={buttonRef}>
				<SelectValue className={searchSelectStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronsUpDown className={selectStyles.icon} />
				</span>
			</Button>
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover
				className={clsx(selectStyles.popover, searchSelectStyles.popover)}
			>
				<Autocomplete
					inputValue={search.filterText}
					onInputChange={search.setFilterText}
				>
					<SearchField
						aria-label="Search"
						autoFocus
						className={selectStyles.searchField}
					>
						<Search aria-hidden className={selectStyles.icon} />
						<Input
							className={clsx(inputClassName, selectStyles.searchInput)}
							data-testid={inputTestId}
						/>
						<Button className={selectStyles.searchClearButton}>
							<X className={selectStyles.icon} />
						</Button>
					</SearchField>
					<ListBox items={search.items} className={selectStyles.listBox}>
						{(item) =>
							typeof item.id === "string" ? (
								<PlaceholderItem id={item.id} i18nKey={i18nKey} />
							) : (
								renderItem(item as TItem)
							)
						}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
}

function PlaceholderItem({
	id,
	i18nKey,
}: {
	id: "PLACEHOLDER" | "NO_RESULTS";
	i18nKey: keyof typeof PLACEHOLDER_TEXTS;
}) {
	const { t } = useTranslation(["common"]);

	// for some reason the `renderEmptyState` on ListBox is not working
	// so doing this as a workaround
	return (
		<ListBoxItem
			textValue="PLACEHOLDER"
			isDisabled
			className={searchSelectStyles.placeholder}
		>
			{id === "PLACEHOLDER"
				? t(PLACEHOLDER_TEXTS[i18nKey].placeholder)
				: t(PLACEHOLDER_TEXTS[i18nKey].noResults)}
		</ListBoxItem>
	);
}
