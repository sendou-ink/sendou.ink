import type * as React from "react";
import {
	Autocomplete,
	type Key,
	ListBoxItem,
	type SelectProps,
	SelectValue,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import styles from "./SearchSelect.module.css";
import {
	SelectShell,
	SelectShellItem,
	SelectShellListBox,
	SelectShellPopover,
	SelectShellSearchField,
	SelectShellTrigger,
} from "./SelectShell";
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
		<SelectShell
			name={name}
			placeholder=""
			selectedKey={search.selectedKey}
			onSelectionChange={(key: Key | null) => {
				if (key != null) {
					search.onSelectionChange(Number(key));
				}
			}}
			aria-label={ariaLabel}
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<SelectShellTrigger ref={buttonRef}>
				<SelectValue className={styles.selectValue} />
			</SelectShellTrigger>
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<SelectShellPopover className={styles.popover}>
				<Autocomplete
					inputValue={search.filterText}
					onInputChange={search.setFilterText}
				>
					<SelectShellSearchField
						inputClassName={inputClassName}
						inputTestId={inputTestId}
					/>
					<SelectShellListBox items={search.items}>
						{(item) =>
							typeof item.id === "string" ? (
								<PlaceholderItem id={item.id} i18nKey={i18nKey} />
							) : (
								renderItem(item as TItem)
							)
						}
					</SelectShellListBox>
				</Autocomplete>
			</SelectShellPopover>
		</SelectShell>
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
			className={styles.placeholder}
		>
			{id === "PLACEHOLDER"
				? t(PLACEHOLDER_TEXTS[i18nKey].placeholder)
				: t(PLACEHOLDER_TEXTS[i18nKey].noResults)}
		</ListBoxItem>
	);
}

/**
 * One result inside a `SearchSelect`'s list: an optional leading avatar or
 * logo, then the texts. `SearchSelectItemAdditionalText` renders the muted
 * second line, which is hidden while the item is shown in the trigger.
 */
export function SearchSelectItem({
	id,
	textValue,
	testId,
	leading,
	children,
}: {
	id: number;
	textValue: string;
	testId: string;
	leading?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<SelectShellItem
			id={id}
			textValue={textValue}
			className={styles.item}
			data-testid={testId}
		>
			{leading}
			<div className={styles.itemTextsContainer}>{children}</div>
		</SelectShellItem>
	);
}

export function SearchSelectItemLogo({ src }: { src: string }) {
	return <img src={src} alt="" className={styles.logo} />;
}

export function SearchSelectItemAdditionalText({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.itemAdditionalText}>{children}</div>;
}
