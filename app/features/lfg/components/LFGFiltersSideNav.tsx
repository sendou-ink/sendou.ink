import { Funnel } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { SideNav, SideNavHeader } from "~/components/SideNav";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { LFGType } from "~/db/tables";
import type { TierName } from "~/features/mmr/mmr-constants";
import { TIERS } from "~/features/mmr/mmr-constants";
import { languagesUnified } from "~/modules/i18n/config";
import { LFG } from "../lfg-constants";
import type { LFGFiltersState } from "../lfg-types";

import styles from "./LFGFiltersSideNav.module.css";

export function LFGFiltersSideNav({
	filters,
	setFilters,
	showClose,
}: {
	filters: LFGFiltersState;
	setFilters: (filters: LFGFiltersState) => void;
	showClose?: boolean;
}) {
	const { t } = useTranslation(["common", "lfg"]);

	return (
		<SideNav>
			<SideNavHeader icon={<Funnel />} showClose={showClose}>
				{t("lfg:filters.header")}
			</SideNavHeader>

			<div className={styles.filterSection}>
				<Label htmlFor="type-filter" spaced={false}>
					{t("lfg:filters.Type")}
				</Label>
				<select
					id="type-filter"
					value={filters.type ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							type: e.target.value === "" ? null : (e.target.value as LFGType),
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					{LFG.types.map((type) => (
						<option key={type} value={type}>
							{t(`lfg:types.${type}`)}
						</option>
					))}
				</select>
			</div>

			<div className={styles.filterSection}>
				<Label spaced={false}>{t("lfg:filters.Weapon")}</Label>
				<WeaponSelect
					disabledWeaponIds={filters.weapon}
					onChange={(weaponId) =>
						setFilters({
							...filters,
							weapon:
								filters.weapon.length >= 10
									? [...filters.weapon.slice(1, 10), weaponId]
									: [...filters.weapon, weaponId],
						})
					}
					key={filters.weapon.join("-")}
				/>
				{filters.weapon.length > 0 ? (
					<div className={styles.weaponBadges}>
						{filters.weapon.map((weapon) => (
							<SendouButton
								key={weapon}
								variant="minimal"
								onPress={() =>
									setFilters({
										...filters,
										weapon: filters.weapon.filter(
											(weaponId) => weaponId !== weapon,
										),
									})
								}
							>
								<WeaponImage weaponSplId={weapon} size={32} variant="badge" />
							</SendouButton>
						))}
					</div>
				) : null}
			</div>

			<div className={styles.filterSection}>
				<Label htmlFor="timezone-filter" spaced={false}>
					{t("lfg:filters.Timezone")}
				</Label>
				<select
					id="timezone-filter"
					value={filters.timezone ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							timezone: e.target.value === "" ? null : Number(e.target.value),
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					{Array.from({ length: 13 }, (_, i) => i).map((hours) => (
						<option key={hours} value={hours}>
							±{hours}h
						</option>
					))}
				</select>
			</div>

			<div className={styles.filterSection}>
				<Label htmlFor="language-filter" spaced={false}>
					{t("lfg:filters.Language")}
				</Label>
				<select
					id="language-filter"
					value={filters.language ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							language: e.target.value === "" ? null : e.target.value,
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					{languagesUnified.map((language) => (
						<option key={language.code} value={language.code}>
							{language.name}
						</option>
					))}
				</select>
			</div>

			<div className={styles.filterSection}>
				<Label htmlFor="plustier-filter" spaced={false}>
					{t("lfg:filters.PlusTier")}
				</Label>
				<select
					id="plustier-filter"
					value={filters.plusTier ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							plusTier: e.target.value === "" ? null : Number(e.target.value),
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					<option value="1">+1</option>
					<option value="2">+2 {t("lfg:filters.orAbove")}</option>
					<option value="3">+3 {t("lfg:filters.orAbove")}</option>
				</select>
			</div>

			<div className={styles.filterSection}>
				<Label htmlFor="mintier-filter" spaced={false}>
					{t("lfg:filters.MinTier")}
				</Label>
				<select
					id="mintier-filter"
					value={filters.minTier ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							minTier:
								e.target.value === "" ? null : (e.target.value as TierName),
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					{TIERS.map((tier) => (
						<option key={tier.name} value={tier.name}>
							{R.capitalize(tier.name.toLowerCase())}
						</option>
					))}
				</select>
			</div>

			<div className={styles.filterSection}>
				<Label htmlFor="maxtier-filter" spaced={false}>
					{t("lfg:filters.MaxTier")}
				</Label>
				<select
					id="maxtier-filter"
					value={filters.maxTier ?? ""}
					onChange={(e) =>
						setFilters({
							...filters,
							maxTier:
								e.target.value === "" ? null : (e.target.value as TierName),
						})
					}
				>
					<option value="">{t("common:select.any")}</option>
					{TIERS.map((tier) => (
						<option key={tier.name} value={tier.name}>
							{R.capitalize(tier.name.toLowerCase())}
						</option>
					))}
				</select>
			</div>
		</SideNav>
	);
}
