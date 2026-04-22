import clsx from "clsx";
import type { TFunction } from "i18next";
import { Search } from "lucide-react";
import * as React from "react";
import {
	Button,
	Dialog,
	DialogTrigger,
	ListBox,
	ListBoxItem,
	Modal,
	ModalOverlay,
	Radio,
	RadioGroup,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useFetcher, useSearchParams } from "react-router";
import { useDebounce } from "react-use";
import { Avatar } from "~/components/Avatar";
import { Image } from "~/components/Image";
import { Input } from "~/components/Input";
import type { SearchLoaderData } from "~/features/search/routes/search";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { altWeaponIdToId } from "~/modules/in-game-lists/weapon-ids";
import {
	mySlugify,
	navIconUrl,
	teamPage,
	tournamentOrganizationPage,
	userPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import styles from "./GlobalSearch.module.css";
import {
	filterWeaponResults,
	getRecentWeapons,
	type SelectedWeapon,
	saveRecentWeapon,
	WeaponDestinationMenu,
	WeaponResultsList,
} from "./WeaponSearch";

const SEARCH_TYPES = [
	"weapons",
	"users",
	"teams",
	"organizations",
	"tournaments",
] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

const SEARCH_TYPE_TO_PREFIX: Record<SearchType, string> = {
	weapons: "w",
	users: "u",
	teams: "t",
	organizations: "o",
	tournaments: "to",
};

const STORAGE_KEY = "global-search-search-type";

function searchTypeIconPath(type: SearchType): string {
	if (type === "weapons") {
		return weaponCategoryUrl("SHOOTERS");
	}
	const navIcons: Record<Exclude<SearchType, "weapons">, string> = {
		users: "u",
		teams: "t",
		organizations: "medal",
		tournaments: "calendar",
	};
	return navIconUrl(navIcons[type]);
}

function getInitialSearchType(): SearchType {
	if (typeof window === "undefined") return "weapons";
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && SEARCH_TYPES.includes(stored as SearchType)) {
			return stored as SearchType;
		}
	} catch {
		// localStorage may be unavailable
	}
	return "weapons";
}

export function GlobalSearch() {
	const { t } = useTranslation(["common"]);
	// TODO: use zod validated search params
	const [searchParams, setSearchParams] = useSearchParams();
	const [isMac, setIsMac] = React.useState(false);

	const searchParamOpen = searchParams.get("search") === "open";
	const searchParamType = searchParams.get("type");
	const searchParamWeapon = searchParams.get("weapon");
	const initialSearchType =
		searchParamType && SEARCH_TYPES.includes(searchParamType as SearchType)
			? (searchParamType as SearchType)
			: null;

	const [isOpen, setIsOpen] = React.useState(searchParamOpen);

	React.useEffect(() => {
		if (searchParamOpen) {
			setIsOpen(true);
		}
	}, [searchParamOpen]);

	React.useEffect(() => {
		setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
	}, []);

	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const modifierKey = isMac ? e.metaKey : e.ctrlKey;
			if (modifierKey && e.key === "k") {
				e.preventDefault();
				setIsOpen(true);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isMac]);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (!open && (searchParamOpen || searchParamType || searchParamWeapon)) {
			const newParams = new URLSearchParams(searchParams);
			newParams.delete("search");
			newParams.delete("type");
			newParams.delete("weapon");
			setSearchParams(newParams, { replace: true });
		}
	};

	return (
		<DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
			<Button className={styles.searchButton}>
				<Search className={styles.searchIcon} />
				<span className={styles.searchPlaceholder}>{t("common:search")}</span>
				<kbd className={styles.searchKbd}>{isMac ? "Cmd+K" : "Ctrl+K"}</kbd>
			</Button>
			<ModalOverlay className={styles.overlay} isDismissable>
				<Modal className={styles.modal}>
					<Dialog className={styles.dialog} aria-label={t("common:search")}>
						<GlobalSearchContent
							onClose={() => setIsOpen(false)}
							initialSearchType={initialSearchType}
							initialWeaponId={searchParamWeapon}
						/>
					</Dialog>
				</Modal>
			</ModalOverlay>
		</DialogTrigger>
	);
}

function resolveInitialWeapon(
	weaponIdStr: string | null,
	t: TFunction<["common", "weapons"]>,
): SelectedWeapon | null {
	if (!weaponIdStr) return null;
	const id = Number(weaponIdStr) as MainWeaponId;
	if (Number.isNaN(id)) return null;
	const name = t(`weapons:MAIN_${id}`);
	if (!name || name === `MAIN_${id}`) return null;
	const englishName = t(`weapons:MAIN_${id}`, { lng: "en" });
	const baseId = altWeaponIdToId.get(id);
	const slugName =
		baseId !== undefined
			? t(`weapons:MAIN_${baseId}`, { lng: "en" })
			: englishName;
	return { id, name, englishName, slug: mySlugify(slugName) };
}

function GlobalSearchContent({
	onClose,
	initialSearchType,
	initialWeaponId,
}: {
	onClose: () => void;
	initialSearchType: SearchType | null;
	initialWeaponId: string | null;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const [query, setQuery] = React.useState("");
	const [searchType, setSearchType] = React.useState<SearchType>(
		initialSearchType ?? getInitialSearchType(),
	);
	const [selectedWeapon, setSelectedWeapon] =
		React.useState<SelectedWeapon | null>(
			resolveInitialWeapon(initialWeaponId, t),
		);

	const inputRef = React.useRef<HTMLInputElement>(null);
	const listBoxRef = React.useRef<HTMLDivElement>(null);
	const modifierKeyRef = React.useRef(false);

	const handleClickCapture = (e: React.MouseEvent) => {
		modifierKeyRef.current = e.metaKey || e.ctrlKey;
	};

	const fetcher = useFetcher<SearchLoaderData>();

	React.useEffect(() => {
		if (!selectedWeapon) {
			inputRef.current?.focus();
		}
	}, [selectedWeapon]);

	React.useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, searchType);
		} catch {
			// localStorage may be unavailable
		}
	}, [searchType]);

	useDebounce(
		() => {
			if (searchType === "weapons") return;
			if (query.length < 3) return;
			fetcher.load(
				`/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=10`,
			);
		},
		300,
		[query, searchType],
	);

	const hasQuery = query.length >= 3;
	const fetchedType = fetcher.data?.type ?? null;
	const results =
		hasQuery && fetchedType === searchType ? (fetcher.data?.results ?? []) : [];

	const weaponResults =
		searchType === "weapons" && hasQuery ? filterWeaponResults(query, t) : [];

	const recentWeapons: SelectedWeapon[] =
		searchType === "weapons"
			? getRecentWeapons().map((id) => {
					const name = t(`weapons:MAIN_${id}`);
					const englishName = t(`weapons:MAIN_${id}`, { lng: "en" });
					const baseId = altWeaponIdToId.get(id);
					const slugName =
						baseId !== undefined
							? t(`weapons:MAIN_${baseId}`, { lng: "en" })
							: englishName;
					return { id, name, englishName, slug: mySlugify(slugName) };
				})
			: [];

	const handleSelect = (key: React.Key) => {
		if (searchType === "weapons") {
			const weapon =
				weaponResults.find((w) => `weapon-${w.id}` === key) ??
				recentWeapons.find((w) => `weapon-${w.id}` === key);
			if (weapon) {
				setSelectedWeapon(weapon);
				setQuery("");
			}
			return;
		}

		if (!modifierKeyRef.current) {
			onClose();
		}
	};

	const handleSearchTypeChange = (value: string) => {
		setSearchType(value as SearchType);
		setSelectedWeapon(null);
	};

	const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		const separatorMatch = value.match(/^([a-zA-Z]+)\.$/);

		if (separatorMatch) {
			const typedPrefix = separatorMatch[1];
			const matchedType = SEARCH_TYPES.find(
				(type) => SEARCH_TYPE_TO_PREFIX[type] === typedPrefix,
			);
			if (matchedType) {
				setSearchType(matchedType);
				setSelectedWeapon(null);
				setQuery("");
				return;
			}
		}

		setQuery(value);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const currentResults = searchType === "weapons" ? weaponResults : results;
		if (e.key === "ArrowDown" && currentResults.length > 0) {
			e.preventDefault();
			listBoxRef.current?.focus();
		}
	};

	const handleDestinationSelect = () => {
		if (!selectedWeapon) return;

		saveRecentWeapon(selectedWeapon.id);
		if (!modifierKeyRef.current) {
			onClose();
		}
	};

	const handleBackToWeaponSearch = () => {
		setSelectedWeapon(null);
	};

	if (searchType === "weapons" && selectedWeapon) {
		return (
			<div onClickCapture={handleClickCapture}>
				<WeaponDestinationMenu
					selectedWeapon={selectedWeapon}
					onBack={handleBackToWeaponSearch}
					onSelect={handleDestinationSelect}
					listBoxRef={listBoxRef}
				/>
			</div>
		);
	}

	return (
		<div onClickCapture={handleClickCapture}>
			<div className={styles.inputContainer}>
				<p className={styles.inputPrefix}>
					{`${SEARCH_TYPE_TO_PREFIX[searchType]}.`}
				</p>
				<Input
					ref={inputRef}
					className={styles.input}
					placeholder={t("common:search.placeholder")}
					value={query}
					onChange={handleQueryChange}
					onKeyDown={handleInputKeyDown}
					icon={<Search className={styles.inputIcon} />}
				/>
			</div>
			<div className={styles.searchTypeContainer}>
				<RadioGroup
					value={searchType}
					onChange={handleSearchTypeChange}
					orientation="horizontal"
					aria-label="Search type"
					className={styles.searchTypeRadioGroup}
				>
					{SEARCH_TYPES.map((type) => (
						<Radio
							key={type}
							value={type}
							className={styles.searchTypeRadioWrapper}
						>
							{({ isSelected, isHovered, isFocusVisible }) => (
								<span
									className={clsx(styles.searchTypeRadio, {
										[styles.searchTypeRadioSelected]: isSelected,
										[styles.searchTypeRadioHovered]: isHovered && !isSelected,
										[styles.searchTypeRadioFocusVisible]: isFocusVisible,
									})}
								>
									<Image path={searchTypeIconPath(type)} size={18} alt="" />
									{t(`common:search.type.${type}`)}
								</span>
							)}
						</Radio>
					))}
				</RadioGroup>
			</div>
			{searchType === "weapons" ? (
				<WeaponResultsList
					weaponResults={weaponResults}
					recentWeapons={recentWeapons}
					onSelect={handleSelect}
					hasQuery={hasQuery}
					listBoxRef={listBoxRef}
				/>
			) : (
				<ListBox
					ref={listBoxRef}
					className={clsx(styles.listBox, "scrollbar")}
					aria-label={t("common:search")}
					onAction={handleSelect}
					renderEmptyState={() =>
						hasQuery ? (
							<div className={styles.emptyState}>
								{t("common:search.noResults")}
							</div>
						) : (
							<div className={styles.emptyState}>{t("common:search.hint")}</div>
						)
					}
				>
					{results.map((result) => (
						<ListBoxItem
							key={getResultKey(result)}
							id={getResultKey(result)}
							href={getResultHref(result)}
							className={styles.listBoxItem}
						>
							<ResultItem result={result} />
						</ListBoxItem>
					))}
				</ListBox>
			)}
		</div>
	);
}

type SearchResult = NonNullable<SearchLoaderData>["results"][number];

function getResultKey(result: SearchResult): string {
	switch (result.type) {
		case "user":
			return `user-${result.id}`;
		case "team":
			return `team-${result.customUrl}`;
		case "organization":
			return `org-${result.id}`;
		case "tournament":
			return `tournament-${result.id}`;
	}
}

function getResultHref(result: SearchResult): string {
	switch (result.type) {
		case "user":
			return userPage({
				discordId: result.discordId,
				customUrl: result.customUrl,
			});
		case "team":
			return teamPage(result.customUrl);
		case "organization":
			return tournamentOrganizationPage({ organizationSlug: result.slug });
		case "tournament":
			return `/to/${result.id}`;
	}
}

function ResultItem({ result }: { result: SearchResult }) {
	switch (result.type) {
		case "user":
			return (
				<div className={styles.resultItem}>
					<Avatar
						user={{
							discordId: result.discordId,
							discordAvatar: result.discordAvatar,
						}}
						size="xxs"
					/>
					<div className={styles.resultTexts}>
						<span className={styles.resultName}>{result.name}</span>
						{result.secondaryName ? (
							<span className={styles.resultSecondary}>
								{result.secondaryName}
							</span>
						) : null}
					</div>
				</div>
			);
		case "team":
			return (
				<div className={styles.resultItem}>
					<Avatar
						url={result.avatarUrl}
						size="xxs"
						identiconInput={result.name}
					/>
					<span className={styles.resultName}>{result.name}</span>
				</div>
			);
		case "organization":
			return (
				<div className={styles.resultItem}>
					<Avatar
						url={result.avatarUrl}
						size="xxs"
						identiconInput={result.name}
					/>
					<span className={styles.resultName}>{result.name}</span>
				</div>
			);
		case "tournament":
			return (
				<div className={styles.resultItem}>
					{result.logoUrl ? (
						<img
							src={result.logoUrl}
							alt=""
							width={24}
							height={24}
							className={styles.resultLogo}
						/>
					) : null}
					<span className={styles.resultName}>{result.name}</span>
				</div>
			);
	}
}
