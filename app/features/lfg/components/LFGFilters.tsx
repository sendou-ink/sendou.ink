import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { CrossIcon } from "~/components/icons/Cross";
import { Label } from "~/components/Label";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { Tables } from "~/db/tables";
import type { TierName } from "~/features/mmr/mmr-constants";
import { TIERS } from "~/features/mmr/mmr-constants";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { LFG } from "../lfg-constants";
import type { LFGFilter } from "../lfg-types";

import styles from "./LFGFilters.module.css";

export function LFGFilters({
	filters,
	changeFilter,
	removeFilterByTag,
}: {
	filters: LFGFilter[];
	changeFilter: (newFilter: LFGFilter) => void;
	removeFilterByTag: (tag: string) => void;
}) {
	if (filters.length === 0) {
		return null;
	}

	return (
		<div className="stack md">
			{filters.map((filter) => (
				<Filter
					key={filter._tag}
					filter={filter}
					changeFilter={changeFilter}
					removeFilter={() => removeFilterByTag(filter._tag)}
				/>
			))}
		</div>
	);
}

function Filter({
	filter,
	changeFilter,
	removeFilter,
}: {
	filter: LFGFilter;
	changeFilter: (newFilter: LFGFilter) => void;
	removeFilter: () => void;
}) {
	const { t } = useTranslation(["lfg"]);

	return (
		<div>
			<div className="stack horizontal justify-between">
				<Label htmlFor={`${filter._tag.toLowerCase()}-filter`}>
					{t(`lfg:filters.${filter._tag}`)} {t("lfg:filters.suffix")}
				</Label>
				<SendouButton
					icon={<CrossIcon />}
					size="small"
					variant="minimal-destructive"
					onPress={removeFilter}
					aria-label="Delete filter"
				/>
			</div>
			<div className={styles.filter}>
				{filter._tag === "Weapon" && (
					<WeaponFilterFields
						value={filter.weaponSplIds}
						changeFilter={changeFilter}
					/>
				)}
				{filter._tag === "Type" && (
					<TypeFilterFields value={filter.type} changeFilter={changeFilter} />
				)}
				{filter._tag === "Timezone" && (
					<TimezoneFilterFields
						value={filter.maxHourDifference}
						changeFilter={changeFilter}
					/>
				)}
				{filter._tag === "Language" && (
					<LanguageFilterFields
						value={filter.language}
						changeFilter={changeFilter}
					/>
				)}
				{filter._tag === "PlusTier" && (
					<PlusTierFilterFields
						value={filter.tier}
						changeFilter={changeFilter}
					/>
				)}
				{filter._tag === "MaxTier" && (
					<TierFilterFields
						_tag="MaxTier"
						value={filter.tier}
						changeFilter={changeFilter}
					/>
				)}
				{filter._tag === "MinTier" && (
					<TierFilterFields
						_tag="MinTier"
						value={filter.tier}
						changeFilter={changeFilter}
					/>
				)}
			</div>
		</div>
	);
}

function WeaponFilterFields({
	value,
	changeFilter,
}: {
	value: MainWeaponId[];
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	return (
		<div className="stack horizontal sm flex-wrap">
			<WeaponSelect
				disabledWeaponIds={value}
				onChange={(weaponId) =>
					changeFilter({
						_tag: "Weapon",
						weaponSplIds:
							value.length >= 10
								? [...value.slice(1, 10), weaponId]
								: [...value, weaponId],
					})
				}
				key={value.join("-")}
			/>
			{value.map((weapon) => (
				<SendouButton
					key={weapon}
					variant="minimal"
					onPress={() =>
						changeFilter({
							_tag: "Weapon",
							weaponSplIds: value.filter((weaponId) => weaponId !== weapon),
						})
					}
				>
					<WeaponImage weaponSplId={weapon} size={32} variant="badge" />
				</SendouButton>
			))}
		</div>
	);
}

function TypeFilterFields({
	value,
	changeFilter,
}: {
	value: Tables["LFGPost"]["type"];
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	const { t } = useTranslation(["lfg"]);

	return (
		<div>
			<select
				id="type-filter"
				className="w-max"
				value={value}
				onChange={(e) =>
					changeFilter({
						_tag: "Type",
						type: e.target.value as Tables["LFGPost"]["type"],
					})
				}
			>
				{LFG.types.map((type) => (
					<option key={type} value={type}>
						{t(`lfg:types.${type}`)}
					</option>
				))}
			</select>
		</div>
	);
}

function TimezoneFilterFields({
	value,
	changeFilter,
}: {
	value: number;
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	return (
		<div>
			<input
				id="timezone-filter"
				type="number"
				value={value}
				min={0}
				max={12}
				onChange={(e) => {
					changeFilter({
						_tag: "Timezone",
						maxHourDifference: Number(e.target.value),
					});
				}}
			/>
		</div>
	);
}

function LanguageFilterFields({
	value,
	changeFilter,
}: {
	value: string;
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	return (
		<div>
			<select
				id="language-filter"
				className="w-max"
				value={value}
				onChange={(e) =>
					changeFilter({
						_tag: "Language",
						language: e.target.value as Tables["LFGPost"]["type"],
					})
				}
			>
				{languagesUnified.map((language) => (
					<option key={language.code} value={language.code}>
						{language.name}
					</option>
				))}
			</select>
		</div>
	);
}

function PlusTierFilterFields({
	value,
	changeFilter,
}: {
	value: number;
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	const { t } = useTranslation(["lfg"]);

	return (
		<div>
			<select
				id="plustier-filter"
				value={value}
				onChange={(e) =>
					changeFilter({ _tag: "PlusTier", tier: Number(e.target.value) })
				}
				className="w-max"
			>
				<option value="1">+1</option>
				<option value="2">+2 {t("lfg:filters.orAbove")}</option>
				<option value="3">+3 {t("lfg:filters.orAbove")}</option>
			</select>
		</div>
	);
}

function TierFilterFields({
	_tag,
	value,
	changeFilter,
}: {
	_tag: "MaxTier" | "MinTier";
	value: TierName;
	changeFilter: (newFilter: LFGFilter) => void;
}) {
	return (
		<div>
			<select
				id={`${_tag.toLowerCase()}-filter`}
				value={value}
				onChange={(e) =>
					changeFilter({ _tag, tier: e.target.value as TierName })
				}
				className="w-max"
			>
				{TIERS.map((tier) => (
					<option key={tier.name} value={tier.name}>
						{R.capitalize(tier.name.toLowerCase())}
					</option>
				))}
			</select>
		</div>
	);
}
