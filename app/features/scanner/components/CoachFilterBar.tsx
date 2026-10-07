/** Coach mode's game filters (core/CoachFilters.ts) as filter bar pills, offering only the values the file's games read. */
import type * as React from "react";
import {
	type SelectKey,
	SendouSelect,
	SendouSelectItem,
} from "~/components/elements/Select";
import type { FilterBarPill } from "~/components/filter-bar/FilterBar";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { RadioGroupFormField } from "~/form/fields/InputGroupFormField";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import * as CoachFilters from "../core/CoachFilters";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
} from "../core/labels";
import type { ScannerLobby } from "../scanner-types";

export function CoachFilterBar({
	filters,
	options,
	onChange,
	summary,
}: {
	filters: CoachFilters.Filters;
	options: CoachFilters.Options;
	onChange: (filters: CoachFilters.Filters) => void;
	/** shown at the bar's end, e.g. how many games pass */
	summary: React.ReactNode;
}) {
	const set = (patch: Partial<CoachFilters.Filters>) =>
		onChange({ ...filters, ...patch });

	const pills: FilterBarPill[] = [
		{
			key: "lobby",
			name: "Match type",
			formattedValue: lobbyLabel(filters.lobby),
			onRemove: () => set({ lobby: null }),
			usableLoggedOut: true,
			popover: (
				<SendouSelect
					aria-label="Match type"
					items={options.lobbies.map((id) => ({ id }))}
					selectedKey={filters.lobby}
					onSelectionChange={(key) =>
						set({ lobby: key as ScannerLobby | null })
					}
				>
					{({ id }) => (
						<SendouSelectItem key={id} id={id}>
							{lobbyLabel(id)}
						</SendouSelectItem>
					)}
				</SendouSelect>
			),
		},
		{
			key: "mode",
			name: "Mode",
			formattedValue: modeLabel(filters.mode),
			onRemove: () => set({ mode: null }),
			usableLoggedOut: true,
			popover: (
				<SendouSelect
					aria-label="Mode"
					items={options.modes.map((id) => ({ id }))}
					selectedKey={filters.mode}
					onSelectionChange={(key) => set({ mode: key as ModeShort | null })}
				>
					{({ id }) => (
						<SendouSelectItem key={id} id={id} textValue={modeLabel(id)!}>
							<span className="stack horizontal sm items-center">
								<ModeImage mode={id} size={18} />
								{modeLabel(id)}
							</span>
						</SendouSelectItem>
					)}
				</SendouSelect>
			),
		},
		{
			key: "stage",
			name: "Stage",
			formattedValue: stageLabel(filters.stage),
			onRemove: () => set({ stage: null }),
			usableLoggedOut: true,
			popover: (
				<SendouSelect
					aria-label="Stage"
					items={options.stages.map((id) => ({ id }))}
					selectedKey={filters.stage}
					onSelectionChange={(key) => set({ stage: key as StageId | null })}
					search={{}}
				>
					{({ id }) => (
						<SendouSelectItem key={id} id={id} textValue={stageLabel(id)!}>
							<span className="stack horizontal sm items-center">
								<StageImage stageId={id} width={32} className="rounded" />
								{stageLabel(id)}
							</span>
						</SendouSelectItem>
					)}
				</SendouSelect>
			),
		},
		{
			key: "knockout",
			name: "Ending",
			formattedValue:
				filters.knockout === null
					? null
					: filters.knockout
						? "Knockout"
						: "Played to time",
			onRemove: () => set({ knockout: null }),
			onAdd: () => set({ knockout: true }),
			usableLoggedOut: true,
			popover: (
				<RadioGroupFormField
					name="knockout"
					label="Ending"
					items={[
						{ label: "Knockout", value: "KO" },
						{ label: "Played to time", value: "TIME" },
					]}
					value={filters.knockout === false ? "TIME" : "KO"}
					onChange={(value) => set({ knockout: value === "KO" })}
					onBlur={() => {}}
				/>
			),
		},
		weaponPill({
			key: "friendlyWeapon",
			name: "Team weapon",
			weapons: options.friendlyWeapons,
			value: filters.friendlyWeapon,
			onChange: (friendlyWeapon) => set({ friendlyWeapon }),
		}),
		weaponPill({
			key: "enemyWeapon",
			name: "Enemy weapon",
			weapons: options.enemyWeapons,
			value: filters.enemyWeapon,
			onChange: (enemyWeapon) => set({ enemyWeapon }),
		}),
		namePill({
			key: "friendlyName",
			name: "Teammate",
			names: options.friendlyNames,
			value: filters.friendlyName,
			onChange: (friendlyName) => set({ friendlyName }),
		}),
		namePill({
			key: "enemyName",
			name: "Enemy",
			names: options.enemyNames,
			value: filters.enemyName,
			onChange: (enemyName) => set({ enemyName }),
		}),
	];

	return (
		<FilterBar
			pills={pills}
			onReset={
				CoachFilters.isActive(filters)
					? () => onChange(CoachFilters.DEFAULT_FILTERS)
					: undefined
			}
			actions={summary}
		/>
	);
}

function weaponPill({
	key,
	name,
	weapons,
	value,
	onChange,
}: {
	key: string;
	name: string;
	weapons: MainWeaponId[];
	value: MainWeaponId | null;
	onChange: (value: MainWeaponId | null) => void;
}): FilterBarPill {
	return {
		key,
		name,
		formattedValue: mainWeaponLabel(value),
		onRemove: () => onChange(null),
		usableLoggedOut: true,
		popover: (
			<SendouSelect
				aria-label={name}
				items={weapons.map((id) => ({ id }))}
				selectedKey={value}
				onSelectionChange={(selected) => onChange(toNullableNumber(selected))}
				search={{}}
			>
				{({ id }) => (
					<SendouSelectItem key={id} id={id} textValue={mainWeaponLabel(id)!}>
						<span className="stack horizontal sm items-center">
							<WeaponImage weaponSplId={id} variant="badge" size={24} />
							{mainWeaponLabel(id)}
						</span>
					</SendouSelectItem>
				)}
			</SendouSelect>
		),
	};
}

function namePill({
	key,
	name,
	names,
	value,
	onChange,
}: {
	key: string;
	name: string;
	names: string[];
	value: string | null;
	onChange: (value: string | null) => void;
}): FilterBarPill {
	return {
		key,
		name,
		formattedValue: value,
		onRemove: () => onChange(null),
		usableLoggedOut: true,
		popover: (
			<SendouSelect
				aria-label={name}
				items={names.map((id) => ({ id }))}
				selectedKey={value}
				onSelectionChange={(selected) =>
					onChange(selected === null ? null : String(selected))
				}
				search={{}}
			>
				{({ id }) => (
					<SendouSelectItem key={id} id={id}>
						{id}
					</SendouSelectItem>
				)}
			</SendouSelect>
		),
	};
}

function toNullableNumber<T extends number>(key: SelectKey | null): T | null {
	return key === null ? null : (Number(key) as T);
}
