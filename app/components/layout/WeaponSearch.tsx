import type { Namespace, TFunction } from "i18next";
import {
	Calculator,
	ChartColumnBig,
	ChevronLeft,
	Flame,
	FlaskConical,
	ImageIcon,
	SlidersHorizontal,
	Users,
	Videotape,
} from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	canonicalWeaponSplId,
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import {
	ANALYZER_URL,
	LFG_PAGE,
	mainWeaponImageUrl,
	mySlugify,
	VODS_PAGE,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
	weaponParamsPage,
} from "~/utils/urls";
import {
	SearchResultsEmptyState,
	SearchResultsItem,
	SearchResultsItemName,
	SearchResultsItemRow,
	SearchResultsListBox,
} from "./SearchResults";
import styles from "./WeaponSearch.module.css";

const WEAPON_DESTINATIONS = [
	"builds",
	"popular",
	"stats",
	"analyzer",
	"params",
	"vods",
	"art",
	"lfg",
] as const;
export type WeaponDestination = (typeof WEAPON_DESTINATIONS)[number];

export interface SelectedWeapon {
	id: MainWeaponId;
	name: string;
	englishName: string;
	slug: string;
	paramsSlug: string;
}

/** {@link SelectedWeapon} for a main weapon id: localized name plus English-derived url slugs. `t` needs the `weapons` namespace. */
export function weaponToSelectedWeapon<Ns extends Namespace>(
	id: MainWeaponId,
	t: TFunction<Ns>,
): SelectedWeapon {
	return {
		id,
		name: t(`weapons:MAIN_${id}` as never),
		englishName: t(`weapons:MAIN_${id}` as never, { lng: "en" }),
		slug: mySlugify(
			t(`weapons:MAIN_${canonicalWeaponSplId(id)}` as never, { lng: "en" }),
		),
		paramsSlug: mySlugify(
			t(`weapons:MAIN_${weaponIdToBaseWeaponId(id)}` as never, { lng: "en" }),
		),
	};
}

export function filterWeaponResults(
	query: string,
	t: TFunction<["common", "weapons"]>,
): SelectedWeapon[] {
	if (!query) return [];

	const matches: SelectedWeapon[] = [];
	for (const id of mainWeaponIds) {
		const isMatch = filterWeapon({
			weapon: { type: "MAIN", id },
			weaponName: t(`weapons:MAIN_${id}`),
			searchTerm: query,
		});

		if (isMatch) {
			matches.push(weaponToSelectedWeapon(id, t));
		}

		if (matches.length >= 10) break;
	}

	return matches;
}

function getWeaponDestinationUrl(
	key: WeaponDestination,
	weapon: SelectedWeapon,
): string {
	const destinations: Record<WeaponDestination, string> = {
		builds: weaponBuildPage(weapon.slug),
		popular: weaponBuildPopularPage(weapon.slug),
		stats: weaponBuildStatsPage(weapon.slug),
		analyzer: `${ANALYZER_URL}?weapon=${weapon.id}`,
		params: weaponParamsPage(weapon.paramsSlug),
		vods: `${VODS_PAGE}?weapon=${weapon.id}`,
		art: `/art?tab=showcase&tag=${encodeURIComponent(weapon.englishName.toLowerCase())}`,
		lfg: `${LFG_PAGE}?q=w.${weapon.id}`,
	};

	return destinations[key];
}

export function WeaponDestinationMenu({
	selectedWeapon,
	onBack,
	onSelect,
	listBoxRef,
}: {
	selectedWeapon: SelectedWeapon;
	onBack: () => void;
	onSelect: (key: React.Key) => void;
	listBoxRef: React.RefObject<HTMLDivElement | null>;
}) {
	const { t } = useTranslation(["common"]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.stopPropagation();
			onBack();
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keyboard navigation for Escape to go back
		<div onKeyDown={handleKeyDown}>
			<div className={styles.weaponDestinationHeader}>
				<button
					type="button"
					className={styles.backButton}
					onClick={onBack}
					aria-label={t("common:actions.back")}
				>
					<ChevronLeft size={16} />
				</button>
				<Image path={mainWeaponImageUrl(selectedWeapon.id)} size={24} alt="" />
				<span className={styles.selectedWeaponName}>{selectedWeapon.name}</span>
			</div>
			<SearchResultsListBox
				ref={listBoxRef}
				aria-label={selectedWeapon.name}
				onAction={onSelect}
				autoFocus="first"
			>
				<SearchResultsItem
					id="builds"
					href={getWeaponDestinationUrl("builds", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<FlaskConical size={20} />
						<SearchResultsItemName>
							{t("common:pages.builds")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="popular"
					href={getWeaponDestinationUrl("popular", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<Flame size={20} />
						<SearchResultsItemName>
							{t("common:pages.popularBuilds")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="stats"
					href={getWeaponDestinationUrl("stats", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<ChartColumnBig size={20} />
						<SearchResultsItemName>
							{t("common:pages.abilityStats")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="analyzer"
					href={getWeaponDestinationUrl("analyzer", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<Calculator size={20} />
						<SearchResultsItemName>
							{t("common:pages.analyzer")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="params"
					href={getWeaponDestinationUrl("params", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<SlidersHorizontal size={20} />
						<SearchResultsItemName>
							{t("common:pages.params")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="vods"
					href={getWeaponDestinationUrl("vods", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<Videotape size={20} />
						<SearchResultsItemName>
							{t("common:pages.vods")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="art"
					href={getWeaponDestinationUrl("art", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<ImageIcon size={20} />
						<SearchResultsItemName>
							{t("common:pages.art")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
				<SearchResultsItem
					id="lfg"
					href={getWeaponDestinationUrl("lfg", selectedWeapon)}
				>
					<SearchResultsItemRow>
						<Users size={20} />
						<SearchResultsItemName>
							{t("common:pages.lfg")}
						</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
			</SearchResultsListBox>
		</div>
	);
}

export function WeaponResultsList({
	weaponResults,
	recentWeapons,
	onSelect,
	hasQuery,
	listBoxRef,
}: {
	weaponResults: SelectedWeapon[];
	recentWeapons: SelectedWeapon[];
	onSelect: (key: React.Key) => void;
	hasQuery: boolean;
	listBoxRef: React.RefObject<HTMLDivElement | null>;
}) {
	const { t } = useTranslation(["common"]);

	const displayedWeapons = hasQuery ? weaponResults : recentWeapons;
	const showNoResults = hasQuery && weaponResults.length === 0;
	const showHint = !hasQuery && recentWeapons.length === 0;

	return (
		<SearchResultsListBox
			ref={listBoxRef}
			className="scrollbar"
			aria-label={t("common:search")}
			selectionMode="single"
			onAction={onSelect}
			renderEmptyState={() =>
				showNoResults ? (
					<SearchResultsEmptyState>
						{t("common:search.noResults")}
					</SearchResultsEmptyState>
				) : showHint ? (
					<SearchResultsEmptyState>
						{t("common:search.hint")}
					</SearchResultsEmptyState>
				) : null
			}
		>
			{displayedWeapons.map((weapon) => (
				<SearchResultsItem
					key={`weapon-${weapon.id}`}
					id={`weapon-${weapon.id}`}
				>
					<SearchResultsItemRow>
						<Image path={mainWeaponImageUrl(weapon.id)} size={24} alt="" />
						<SearchResultsItemName>{weapon.name}</SearchResultsItemName>
					</SearchResultsItemRow>
				</SearchResultsItem>
			))}
		</SearchResultsListBox>
	);
}
