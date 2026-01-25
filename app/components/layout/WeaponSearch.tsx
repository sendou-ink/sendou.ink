import type { TFunction } from "i18next";
import {
	Calculator,
	ChartColumnBig,
	ChevronLeft,
	Flame,
	FlaskConical,
	ImageIcon,
	Users,
} from "lucide-react";
import type * as React from "react";
import { ListBox, ListBoxItem } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { YouTubeIcon } from "~/components/icons/YouTube";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	mainWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import {
	ANALYZER_URL,
	artPage,
	LFG_PAGE,
	mainWeaponImageUrl,
	mySlugify,
	VODS_PAGE,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
} from "~/utils/urls";
import styles from "./CommandPalette.module.css";

const WEAPON_DESTINATIONS = [
	"builds",
	"popular",
	"stats",
	"analyzer",
	"vods",
	"art",
	"lfg",
] as const;
export type WeaponDestination = (typeof WEAPON_DESTINATIONS)[number];

export interface SelectedWeapon {
	id: MainWeaponId;
	name: string;
	slug: string;
}

export function filterWeaponResults(
	query: string,
	t: TFunction<["common", "weapons"]>,
): SelectedWeapon[] {
	if (!query) return [];

	const matches: SelectedWeapon[] = [];
	for (const id of mainWeaponIds) {
		if (weaponIdToType(id) === "ALT_SKIN") continue;

		const weaponName = t(`weapons:MAIN_${id}`);
		const isMatch = filterWeapon({
			weapon: { type: "MAIN", id },
			weaponName,
			searchTerm: query,
		});

		if (isMatch) {
			matches.push({
				id,
				name: weaponName,
				slug: mySlugify(weaponName),
			});
		}

		if (matches.length >= 10) break;
	}

	return matches;
}

export function getWeaponDestinationUrl(
	key: WeaponDestination,
	weapon: SelectedWeapon,
): string {
	const destinations: Record<WeaponDestination, string> = {
		builds: weaponBuildPage(weapon.slug),
		popular: weaponBuildPopularPage(weapon.slug),
		stats: weaponBuildStatsPage(weapon.slug),
		analyzer: `${ANALYZER_URL}?weapon=${weapon.id}`,
		vods: `${VODS_PAGE}?weapon=${weapon.id}`,
		art: artPage(weapon.slug),
		lfg: `${LFG_PAGE}?weapon=${weapon.id}`,
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
	listBoxRef: React.RefObject<HTMLDivElement>;
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
			<ListBox
				ref={listBoxRef}
				className={styles.listBox}
				aria-label={selectedWeapon.name}
				onAction={onSelect}
				autoFocus="first"
			>
				<ListBoxItem id="builds" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<FlaskConical size={20} />
						<span className={styles.resultName}>
							{t("common:pages.builds")}
						</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="popular" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<Flame size={20} />
						<span className={styles.resultName}>
							{t("common:pages.popularBuilds")}
						</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="stats" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<ChartColumnBig size={20} />
						<span className={styles.resultName}>
							{t("common:pages.abilityStats")}
						</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="analyzer" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<Calculator size={20} />
						<span className={styles.resultName}>
							{t("common:pages.analyzer")}
						</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="vods" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<YouTubeIcon className={styles.destinationIcon} />
						<span className={styles.resultName}>{t("common:pages.vods")}</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="art" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<ImageIcon size={20} />
						<span className={styles.resultName}>{t("common:pages.art")}</span>
					</div>
				</ListBoxItem>
				<ListBoxItem id="lfg" className={styles.listBoxItem}>
					<div className={styles.resultItem}>
						<Users size={20} />
						<span className={styles.resultName}>{t("common:pages.lfg")}</span>
					</div>
				</ListBoxItem>
			</ListBox>
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
		<ListBox
			ref={listBoxRef}
			className={styles.listBox}
			aria-label={t("common:search")}
			selectionMode="single"
			onAction={onSelect}
			renderEmptyState={() =>
				showNoResults ? (
					<div className={styles.emptyState}>
						{t("common:search.noResults")}
					</div>
				) : showHint ? (
					<div className={styles.emptyState}>{t("common:search.hint")}</div>
				) : null
			}
		>
			{displayedWeapons.map((weapon) => (
				<ListBoxItem
					key={`weapon-${weapon.id}`}
					id={`weapon-${weapon.id}`}
					className={styles.listBoxItem}
				>
					<div className={styles.resultItem}>
						<Image path={mainWeaponImageUrl(weapon.id)} size={24} alt="" />
						<span className={styles.resultName}>{weapon.name}</span>
					</div>
				</ListBoxItem>
			))}
		</ListBox>
	);
}

const RECENT_WEAPONS_KEY = "command-palette-recent-weapons";
const MAX_RECENT_WEAPONS = 5;

export function getRecentWeapons(): MainWeaponId[] {
	if (typeof window === "undefined") return [];
	try {
		const stored = localStorage.getItem(RECENT_WEAPONS_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(id): id is MainWeaponId =>
				typeof id === "number" && mainWeaponIds.includes(id as MainWeaponId),
		);
	} catch {
		return [];
	}
}

export function saveRecentWeapon(weaponId: MainWeaponId): void {
	try {
		const recent = getRecentWeapons();
		const filtered = recent.filter((id) => id !== weaponId);
		const updated = [weaponId, ...filtered].slice(0, MAX_RECENT_WEAPONS);
		localStorage.setItem(RECENT_WEAPONS_KEY, JSON.stringify(updated));
	} catch {
		// localStorage may be unavailable
	}
}
