import { ArrowLeft, Search } from "lucide-react";
import * as React from "react";
import { type MetaFunction, Outlet, useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { useDebounce } from "~/hooks/useDebounce";
import { languages } from "~/modules/i18n/config";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import * as SearchParams from "~/modules/search-params/search-params";
import { metaTags } from "~/utils/remix";
import { TRANSLATE_PAGE } from "~/utils/urls";
import { DraftActions } from "../components/DraftActions";
import { TranslationProgressBar } from "../components/TranslationProgressBar";
import type * as TranslationDrafts from "../core/TranslationDrafts";
import {
	loader,
	type TranslateLanguageLoaderData,
} from "../loaders/translate.$language.server";
import {
	TRANSLATION_STATUSES,
	type TranslatableLanguage,
	type TranslationStatus,
} from "../translate-constants";
import { translateLanguageSearchParams } from "../translate-search-params";
import styles from "./translate.$language.module.css";

export { loader };

export const shouldRevalidate = SearchParams.skipSearchOnlyRevalidation;

export type TranslateLanguageOutletContext = {
	language: TranslatableLanguage;
	catalog: TranslationDrafts.Catalog;
};

const ALL_NAMESPACES_KEY = "__all__";
const SEARCH_DEBOUNCE_MS = 400;
const STATUS_LABELS: Record<TranslationStatus, string> = {
	untranslated: "Untranslated",
	translated: "Translated",
	drafts: "Your drafts",
	all: "All",
};

export const meta: MetaFunction<typeof loader> = (args) => {
	const language = languages.find(
		(lang) => lang.code === args.loaderData?.language,
	)?.name;

	return metaTags({
		title: language ? `Translate (${language})` : "Translate",
		location: args.location,
	});
};

export default function TranslateLanguageLayout() {
	const data = useLoaderData<TranslateLanguageLoaderData>();

	const languageName = languages.find(
		(lang) => lang.code === data.language,
	)?.name;

	return (
		<Main className="stack lg">
			<div className="stack md">
				<LinkButton
					to={TRANSLATE_PAGE}
					variant="minimal"
					size="small"
					icon={<ArrowLeft />}
					className="self-start"
				>
					All languages
				</LinkButton>
				<div className={styles.header}>
					<h1 className="text-xl">{languageName}</h1>
					<DraftActions language={data.language} catalog={data.catalog} />
				</div>
				<TranslationProgressBar {...data.progress} />
			</div>
			<Filters />
			<Outlet
				context={
					{
						language: data.language,
						catalog: data.catalog,
					} satisfies TranslateLanguageOutletContext
				}
			/>
		</Main>
	);
}

function Filters() {
	const data = useLoaderData<TranslateLanguageLoaderData>();
	const [{ namespace, status, search }, setParams] = useSearchParamsTyped(
		translateLanguageSearchParams,
	);
	const [searchInputValue, setSearchInputValue] = React.useState(search);

	useDebounce(
		() => {
			if (searchInputValue !== search) setParams({ search: searchInputValue });
		},
		SEARCH_DEBOUNCE_MS,
		[searchInputValue],
	);

	const namespaceItems = [
		{
			key: ALL_NAMESPACES_KEY,
			label: "All sections",
			untranslated: data.progress.total - data.progress.translated,
		},
		...data.namespaces.map((summary) => ({
			key: summary.namespace,
			label: summary.namespace,
			untranslated: summary.total - summary.translated,
		})),
	];

	return (
		<div className={styles.filters}>
			<div className={styles.filterRow}>
				<SendouSelect
					label="Section"
					items={namespaceItems}
					selectedKey={namespace ?? ALL_NAMESPACES_KEY}
					onSelectionChange={(key) =>
						setParams({
							namespace:
								key === ALL_NAMESPACES_KEY || key === null ? null : String(key),
						})
					}
					search={{}}
					data-testid="translate-namespace-select"
				>
					{(item) => (
						<SendouSelectItem key={item.key} id={item.key}>
							{item.label}
							{item.untranslated > 0 ? (
								<span className="text-xs text-lighter ml-1">
									({item.untranslated})
								</span>
							) : null}
						</SendouSelectItem>
					)}
				</SendouSelect>
				<div>
					<Label htmlFor="translate-search">Search</Label>
					<Input
						id="translate-search"
						type="search"
						icon={<Search />}
						value={searchInputValue}
						placeholder="Key, English text or translation"
						onChange={(e) => setSearchInputValue(e.target.value)}
						testId="translate-search-input"
					/>
				</div>
			</div>
			<SendouChipRadioGroup wrap>
				{TRANSLATION_STATUSES.map((option) => (
					<SendouChipRadio
						key={option}
						name="translate-status"
						value={option}
						checked={status === option}
						onChange={(value) =>
							setParams({ status: value as TranslationStatus })
						}
					>
						{STATUS_LABELS[option]}
					</SendouChipRadio>
				))}
			</SendouChipRadioGroup>
		</div>
	);
}
