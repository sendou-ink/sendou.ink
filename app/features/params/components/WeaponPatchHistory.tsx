import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import {
	damageReceiverSuffix,
	translateDamageReceiver,
} from "~/features/object-damage-calculator/calculator-constants";
import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";
import {
	useSearchParamState,
	useSearchParamStateEncoder,
} from "~/hooks/useSearchParamState";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import * as WeaponParams from "../core/WeaponParams";
import {
	DAMAGE_MULTIPLIER_PARAM_KEY,
	INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY,
	SPECIAL_POINTS_PARAM_KEY,
} from "../weapon-params-constants";
import type {
	IncomingDamageAttackers,
	KitPatchHistory,
	PatchChange,
	WeaponPatch,
} from "../weapon-params-types";
import styles from "./WeaponPatchHistory.module.css";

const PATCH_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "short",
	year: "numeric",
};

export function WeaponPatchHistory({ patches }: { patches: WeaponPatch[] }) {
	const { t } = useTranslation(["params"]);

	if (patches.length === 0) {
		return <div className={styles.empty}>{t("params:noPatches")}</div>;
	}

	return (
		<div className={styles.container}>
			{patches.map((patch) => (
				<div key={patch.version} className={styles.column}>
					<PatchColumnHeader version={patch.version} date={patch.date} />
					<div className={styles.changes}>
						{patch.changes.map((change, i) => (
							<ChangeBadge key={changeKey(change, i)} change={change} />
						))}
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * Patch history of a main weapon shown one kit at a time: the selected kit's main weapon, sub
 * weapon and special weapon changes are grouped under dividers within the same patch column. Sub
 * and special weapon changes can be toggled off.
 */
export function WeaponPatchHistoryByKit({
	kits,
	defaultWeaponId,
}: {
	kits: KitPatchHistory[];
	defaultWeaponId: MainWeaponId;
}) {
	const { t } = useTranslation(["params"]);

	const kitIds = kits.map((kit) => kit.weaponId);

	const [selectedWeaponId, setSelectedWeaponId] =
		useSearchParamStateEncoder<MainWeaponId>({
			name: "kit",
			defaultValue: defaultWeaponId,
			revive: (value) => {
				const id = Number(value) as MainWeaponId;
				return kitIds.includes(id) ? id : undefined;
			},
			encode: (value) => String(value),
		});

	const [showSubSpecial, setShowSubSpecial] = useSearchParamState({
		name: "kitExtras",
		defaultValue: true,
		revive: (value) =>
			value === "false" ? false : value === "true" ? true : undefined,
	});

	const selectedKit =
		kits.find((kit) => kit.weaponId === selectedWeaponId) ?? kits[0];

	const patches = selectedKit.patches
		.map((patch) => ({
			...patch,
			changes: showSubSpecial
				? patch.changes
				: patch.changes.filter((change) => change.source === "main"),
		}))
		.filter((patch) => patch.changes.length > 0);

	return (
		<div className={styles.kitHistory}>
			<div className={styles.controls}>
				{kits.length > 1 ? (
					<KitFilter
						kits={kits}
						selectedWeaponId={selectedKit.weaponId}
						onSelect={setSelectedWeaponId}
					/>
				) : null}
				<SendouSwitch isSelected={showSubSpecial} onChange={setShowSubSpecial}>
					{t("params:patches.showSubSpecial")}
				</SendouSwitch>
			</div>
			{patches.length === 0 ? (
				<div className={styles.empty}>{t("params:noPatches")}</div>
			) : (
				<div className={styles.container}>
					{patches.map((patch) => (
						<KitPatchColumn
							key={patch.version}
							patch={patch}
							kit={selectedKit}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function KitFilter({
	kits,
	selectedWeaponId,
	onSelect,
}: {
	kits: KitPatchHistory[];
	selectedWeaponId: MainWeaponId;
	onSelect: (weaponId: MainWeaponId) => void;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<SendouChipRadioGroup>
			{kits.map((kit) => (
				<SendouChipRadio
					key={kit.weaponId}
					name="patch-history-kit"
					value={String(kit.weaponId)}
					checked={kit.weaponId === selectedWeaponId}
					onChange={(value) => onSelect(Number(value) as MainWeaponId)}
				>
					<span className={styles.kitChip}>
						<WeaponImage weaponSplId={kit.weaponId} variant="badge" size={20} />
						{t(`weapons:MAIN_${kit.weaponId}`)}
					</span>
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function KitPatchColumn({
	patch,
	kit,
}: {
	patch: WeaponPatch;
	kit: KitPatchHistory;
}) {
	const mainChanges = patch.changes.filter(
		(change) => change.source === "main",
	);
	const subChanges = patch.changes.filter((change) => change.source === "sub");
	const specialChanges = patch.changes.filter(
		(change) => change.source === "special",
	);

	return (
		<div className={styles.column}>
			<PatchColumnHeader version={patch.version} date={patch.date} />
			<div className={styles.changes}>
				{mainChanges.map((change, i) => (
					<ChangeBadge key={changeKey(change, i)} change={change} />
				))}
				{subChanges.length > 0 ? (
					<>
						<SubWeaponDivider subWeaponId={kit.subWeaponId} />
						{subChanges.map((change, i) => (
							<ChangeBadge key={changeKey(change, i)} change={change} />
						))}
					</>
				) : null}
				{specialChanges.length > 0 ? (
					<>
						<SpecialWeaponDivider specialWeaponId={kit.specialWeaponId} />
						{specialChanges.map((change, i) => (
							<ChangeBadge key={changeKey(change, i)} change={change} />
						))}
					</>
				) : null}
			</div>
		</div>
	);
}

function SubWeaponDivider({ subWeaponId }: { subWeaponId: SubWeaponId }) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Divider smallText className={styles.divider}>
			<span className={styles.dividerLabel}>
				<SubWeaponImage subWeaponId={subWeaponId} size={18} />
				{t(`weapons:SUB_${subWeaponId}`)}
			</span>
		</Divider>
	);
}

function SpecialWeaponDivider({
	specialWeaponId,
}: {
	specialWeaponId: SpecialWeaponId;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Divider smallText className={styles.divider}>
			<span className={styles.dividerLabel}>
				<SpecialWeaponImage specialWeaponId={specialWeaponId} size={18} />
				{t(`weapons:SPECIAL_${specialWeaponId}`)}
			</span>
		</Divider>
	);
}

function PatchColumnHeader({
	version,
	date,
}: {
	version: string;
	date: string | null;
}) {
	return (
		<div className={styles.header}>
			<div className={styles.version}>{version}</div>
			{date ? (
				<LocaleTime
					date={new Date(date)}
					options={PATCH_DATE_OPTIONS}
					className={styles.date}
				/>
			) : null}
		</div>
	);
}

function changeKey(change: PatchChange, index: number) {
	return `${change.category}.${change.key}.${change.weaponId ?? ""}.${change.source ?? ""}.${index}`;
}

function ChangeBadge({ change }: { change: PatchChange }) {
	const { t } = useTranslation(["analyzer", "weapons", "game-misc"]);

	if (
		change.category === INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY &&
		change.attackers
	) {
		return <IncomingChangeBadge change={change} attackers={change.attackers} />;
	}

	const isSpecialPoints = change.category === SPECIAL_POINTS_PARAM_KEY;
	const isDamageMultiplier = change.category === DAMAGE_MULTIPLIER_PARAM_KEY;
	// Damage falloff curves serialize to long "damage @ distance" lists that need their own line.
	const isWideValue =
		typeof change.from === "string" && change.from.includes("@");

	const label = isSpecialPoints
		? t("analyzer:stat.specialPoints")
		: isDamageMultiplier
			? translateDamageReceiver(t, change.key as DamageReceiver)
			: change.key;

	return (
		<div
			className={clsx(styles.change, {
				[styles.buff]: change.kind === "buff",
				[styles.nerf]: change.kind === "nerf",
				[styles.wide]: isWideValue,
			})}
			title={
				isSpecialPoints || isDamageMultiplier
					? undefined
					: `${change.category}.${change.key}`
			}
		>
			<span className={styles.changeName}>
				{isSpecialPoints && change.weaponId ? (
					<WeaponImage
						weaponSplId={change.weaponId}
						variant="badge"
						size={20}
						className={styles.changeIcon}
					/>
				) : null}
				{label}
			</span>
			<span className={styles.changeValues}>
				{WeaponParams.formatValue(change.from)}
				<span className={styles.arrow}>→</span>
				{WeaponParams.formatValue(change.to)}
			</span>
		</div>
	);
}

/**
 * An incoming damage multiplier change: a set of attacking weapons whose shared damage rate against
 * the page's sub or special weapon changed. Shows the attacking weapons' icons (with a suffix for
 * multi-part objects, e.g. a Big Bubbler's shield vs. weak point) and the from→to rate.
 */
function IncomingChangeBadge({
	change,
	attackers,
}: {
	change: PatchChange;
	attackers: IncomingDamageAttackers;
}) {
	const { t } = useTranslation(["analyzer", "weapons", "game-misc"]);

	const suffix = damageReceiverSuffix(t, change.key as DamageReceiver);

	return (
		<div
			className={clsx(styles.change, styles.incoming, {
				[styles.buff]: change.kind === "buff",
				[styles.nerf]: change.kind === "nerf",
			})}
			title={translateDamageReceiver(t, change.key as DamageReceiver)}
		>
			<div className={styles.attackers}>
				<span className={styles.attackerIcons}>
					{attackers.mainWeaponIds.map((id) => (
						<WeaponImage
							key={`m-${id}`}
							weaponSplId={id}
							variant="badge"
							size={20}
						/>
					))}
					{attackers.subWeaponIds.map((id) => (
						<SubWeaponImage key={`s-${id}`} subWeaponId={id} size={20} />
					))}
					{attackers.specialWeaponIds.map((id) => (
						<SpecialWeaponImage
							key={`x-${id}`}
							specialWeaponId={id}
							size={20}
						/>
					))}
				</span>
				{suffix ? (
					<span className={styles.attackerSuffix}>{suffix}</span>
				) : null}
			</div>
			<span className={styles.changeValues}>
				{WeaponParams.formatValue(change.from)}
				<span className={styles.arrow}>→</span>
				{WeaponParams.formatValue(change.to)}
			</span>
		</div>
	);
}
