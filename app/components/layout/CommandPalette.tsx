import clsx from "clsx";
import { Search } from "lucide-react";
import * as React from "react";
import {
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
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import { useDebounce } from "react-use";
import { Avatar } from "~/components/Avatar";
import { Image } from "~/components/Image";
import { Input } from "~/components/Input";
import type { SearchLoaderData } from "~/features/search/routes/search";
import {
	mySlugify,
	navIconUrl,
	teamPage,
	tournamentOrganizationPage,
	userPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import styles from "./CommandPalette.module.css";
import {
	filterWeaponResults,
	getRecentWeapons,
	getWeaponDestinationUrl,
	type SelectedWeapon,
	saveRecentWeapon,
	type WeaponDestination,
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

const STORAGE_KEY = "command-palette-search-type";

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

export function CommandPalette() {
	const { t } = useTranslation(["common"]);
	// TODO: use zod validated search params
	const [searchParams, setSearchParams] = useSearchParams();
	const [isMac, setIsMac] = React.useState(false);

	const searchParamOpen = searchParams.get("search") === "open";
	const searchParamType = searchParams.get("type");
	const initialSearchType =
		searchParamType && SEARCH_TYPES.includes(searchParamType as SearchType)
			? (searchParamType as SearchType)
			: null;

	const [isOpen, setIsOpen] = React.useState(searchParamOpen);

	React.useEffect(() => {
		if (searchParamOpen && !isOpen) {
			setIsOpen(true);
		}
	}, [searchParamOpen, isOpen]);

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
		if (!open && (searchParamOpen || searchParamType)) {
			const newParams = new URLSearchParams(searchParams);
			newParams.delete("search");
			newParams.delete("type");
			setSearchParams(newParams, { replace: true });
		}
	};

	return (
		<DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
			<button
				type="button"
				className={styles.searchButton}
				onClick={() => setIsOpen(true)}
			>
				<Search className={styles.searchIcon} />
				<span className={styles.searchPlaceholder}>{t("common:search")}</span>
				<kbd className={styles.searchKbd}>{isMac ? "Cmd+K" : "Ctrl+K"}</kbd>
			</button>
			<ModalOverlay className={styles.overlay}>
				<Modal className={styles.modal}>
					<Dialog className={styles.dialog} aria-label={t("common:search")}>
						<CommandPaletteContent
							onClose={() => handleOpenChange(false)}
							initialSearchType={initialSearchType}
						/>
					</Dialog>
				</Modal>
			</ModalOverlay>
		</DialogTrigger>
	);
}

function CommandPaletteContent({
	onClose,
	initialSearchType,
}: {
	onClose: () => void;
	initialSearchType: SearchType | null;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const navigate = useNavigate();
	const [query, setQuery] = React.useState("");
	const [searchType, setSearchType] = React.useState<SearchType>(
		initialSearchType ?? getInitialSearchType(),
	);
	const [selectedWeapon, setSelectedWeapon] =
		React.useState<SelectedWeapon | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const listBoxRef = React.useRef<HTMLDivElement>(null);

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
			if (!query) return;
			fetcher.load(
				`/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=10`,
			);
		},
		300,
		[query, searchType],
	);

	const results = fetcher.data?.results ?? [];
	const hasQuery = query.length > 0;

	const weaponResults =
		searchType === "weapons" ? filterWeaponResults(query, t) : [];

	const recentWeapons: SelectedWeapon[] =
		searchType === "weapons"
			? getRecentWeapons().map((id) => {
					const name = t(`weapons:MAIN_${id}`);
					return { id, name, slug: mySlugify(name) };
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

		const result = results.find((r) => getResultKey(r) === key);
		if (result) {
			navigate(getResultHref(result));
			onClose();
		}
	};

	const handleSearchTypeChange = (value: string) => {
		setSearchType(value as SearchType);
		setSelectedWeapon(null);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const currentResults = searchType === "weapons" ? weaponResults : results;
		if (e.key === "ArrowDown" && currentResults.length > 0) {
			e.preventDefault();
			listBoxRef.current?.focus();
		}
	};

	const handleDestinationSelect = (key: React.Key) => {
		if (!selectedWeapon) return;

		const url = getWeaponDestinationUrl(
			key as WeaponDestination,
			selectedWeapon,
		);
		saveRecentWeapon(selectedWeapon.id);
		navigate(url);
		onClose();
	};

	const handleBackToWeaponSearch = () => {
		setSelectedWeapon(null);
	};

	if (searchType === "weapons" && selectedWeapon) {
		return (
			<WeaponDestinationMenu
				selectedWeapon={selectedWeapon}
				onBack={handleBackToWeaponSearch}
				onSelect={handleDestinationSelect}
				listBoxRef={listBoxRef}
			/>
		);
	}

	return (
		<>
			<Input
				ref={inputRef}
				className={styles.input}
				placeholder={t("common:search.placeholder")}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={handleInputKeyDown}
				icon={<Search className={styles.inputIcon} />}
			/>
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
					className={styles.listBox}
					aria-label={t("common:search")}
					selectionMode="single"
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
							className={styles.listBoxItem}
						>
							<ResultItem result={result} />
						</ListBoxItem>
					))}
				</ListBox>
			)}
		</>
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
