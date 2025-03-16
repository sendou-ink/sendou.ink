import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { CrossIcon } from "~/components/icons/Cross";
import type { Tables } from "~/db/tables";
import type { TierName } from "~/features/mmr/mmr-constants";
import { TIERS } from "~/features/mmr/mmr-constants";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { capitalize } from "~/utils/strings";
import { LFG } from "../lfg-constants";
import type { LFGFilter } from "../lfg-types";

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
				<Label>
					{t(`lfg:filters.${filter._tag}`)} {t("lfg:filters.suffix")}
				</Label>
				<Button
					icon={<CrossIcon />}
					size="tiny"
					variant="minimal-destructive"
					onClick={removeFilter}
					aria-label="Delete filter"
				/>
			</div>
			<div className="lfg__filter">
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
			<WeaponCombobox
				inputName="weapon"
				key={value.length}
				weaponIdsToOmit={new Set(value)}
				onChange={(wpn) =>
					wpn &&
					changeFilter({
						_tag: "Weapon",
						weaponSplIds:
							value.length >= 10
								? [...value.slice(1, 10), Number(wpn.value) as MainWeaponId]
								: [...value, Number(wpn.value) as MainWeaponId],
					})
				}
			/>
			{value.map((weapon) => (
				<Button
					key={weapon}
					variant="minimal"
					onClick={() =>
						changeFilter({
							_tag: "Weapon",
							weaponSplIds: value.filter((weaponId) => weaponId !== weapon),
						})
					}
				>
					<WeaponImage weaponSplId={weapon} size={32} variant="badge" />
				</Button>
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
				value={value}
				onChange={(e) =>
					changeFilter({ _tag, tier: e.target.value as TierName })
				}
				className="w-max"
			>
				{TIERS.map((tier) => (
					<option key={tier.name} value={tier.name}>
						{capitalize(tier.name.toLowerCase())}
					</option>
				))}
			</select>
		</div>
	);
}
