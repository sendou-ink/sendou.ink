import clsx from "clsx";
import { ChevronDown, ChevronUp, EyeOff, X } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { translateDamageReceiver } from "~/features/object-damage-calculator/calculator-constants";
import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";
import { useSearchParamStateEncoder } from "~/hooks/useSearchParamState";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { mySlugify, weaponParamsPage } from "~/utils/urls";
import { getParamExplanation } from "../core/param-explanations";
import {
	collectAllParamKeys,
	formatParamValue,
	hasParamHistory,
} from "../core/weapon-params";
import type {
	DamageMultiplierWithHistory,
	ParamValueWithHistory,
	SpecialPointWithHistory,
	WeaponParamKind,
	WeaponParamsTableProps,
} from "../weapon-params-types";
import styles from "./WeaponParamsTable.module.css";

const SPECIAL_POINTS_KEY = "__specialPoints__";
const DAMAGE_RATE_INFO_CATEGORY = "DamageRateInfo";

function WeaponParamImage({
	kind,
	id,
	size,
}: {
	kind: WeaponParamKind;
	id: number;
	size: number;
}) {
	if (kind === "sub") {
		return <SubWeaponImage subWeaponId={id as SubWeaponId} size={size} />;
	}
	if (kind === "special") {
		return (
			<SpecialWeaponImage specialWeaponId={id as SpecialWeaponId} size={size} />
		);
	}
	return (
		<WeaponImage weaponSplId={id as MainWeaponId} variant="badge" size={size} />
	);
}

// The display name and (English) url slug of a weapon, resolved from the right `weapons`
// translation key for the table's kind. Ids are cast to their specific union so each key is a
// concrete literal the i18next types recognize.
function useWeaponParamNaming(kind: WeaponParamKind) {
	const { t } = useTranslation(["weapons"]);

	const name = (id: number) => {
		if (kind === "sub") return t(`weapons:SUB_${id as SubWeaponId}`);
		if (kind === "special") {
			return t(`weapons:SPECIAL_${id as SpecialWeaponId}`);
		}
		return t(`weapons:MAIN_${id as MainWeaponId}`);
	};

	const slug = (id: number) =>
		mySlugify(
			kind === "sub"
				? t(`weapons:SUB_${id as SubWeaponId}`, { lng: "en" })
				: kind === "special"
					? t(`weapons:SPECIAL_${id as SpecialWeaponId}`, { lng: "en" })
					: t(`weapons:MAIN_${id as MainWeaponId}`, { lng: "en" }),
		);

	return { name, slug };
}

export function WeaponParamsTable({
	kind,
	currentWeaponId,
	categoryWeaponIds,
	weaponParams,
	specialPoints,
	damageMultipliers,
}: WeaponParamsTableProps) {
	const { t } = useTranslation(["weapons", "common", "analyzer", "params"]);
	const naming = useWeaponParamNaming(kind);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const paramDefinitions = collectAllParamKeys(weaponParams);

	const paramsByCategory: Record<
		string,
		Array<{ key: string; fullKey: string }>
	> = {};
	for (const def of paramDefinitions) {
		if (!paramsByCategory[def.category]) {
			paramsByCategory[def.category] = [];
		}
		paramsByCategory[def.category].push({ key: def.key, fullKey: def.fullKey });
	}

	const toggleRow = (fullKey: string) => {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(fullKey)) {
				next.delete(fullKey);
			} else {
				next.add(fullKey);
			}
			return next;
		});
	};

	const sortedWeaponIds = [
		currentWeaponId,
		...categoryWeaponIds.filter((id) => id !== currentWeaponId),
	];

	const [hiddenWeaponIds, setHiddenWeaponIds] = useSearchParamStateEncoder<
		number[]
	>({
		name: "hidden",
		defaultValue: [],
		revive: (value) =>
			value
				.split(",")
				.map(Number)
				.filter(
					(id) =>
						!Number.isNaN(id) &&
						id !== currentWeaponId &&
						categoryWeaponIds.includes(id),
				),
		encode: (ids) => ids.join(","),
	});

	const hiddenSet = new Set(hiddenWeaponIds);
	const visibleWeaponIds = sortedWeaponIds.filter((id) => !hiddenSet.has(id));

	const hideWeapon = (weaponId: number) =>
		setHiddenWeaponIds([...hiddenWeaponIds, weaponId]);
	const restoreWeapon = (weaponId: number) =>
		setHiddenWeaponIds(hiddenWeaponIds.filter((id) => id !== weaponId));
	const showAllWeapons = () => setHiddenWeaponIds([]);

	const currentWeaponHasParam = (category: string, key: string) => {
		return Boolean(
			weaponParams[String(currentWeaponId)]?.categories[category]?.[key],
		);
	};

	const rowHasHistory = (category: string, key: string) => {
		return visibleWeaponIds.some((id) => {
			const param = weaponParams[String(id)]?.categories[category]?.[key];
			return param && hasParamHistory(param);
		});
	};

	return (
		<>
			<div className={styles.container}>
				{hiddenWeaponIds.length > 0 ? (
					<HiddenWeaponsBar
						kind={kind}
						hiddenWeaponIds={hiddenWeaponIds}
						onRestore={restoreWeapon}
						onShowAll={showAllWeapons}
					/>
				) : null}
				<table className={styles.table}>
					<thead className={styles.thead}>
						<tr>
							<th className={styles.paramHeader}>
								{t("params:header.parameter")}
							</th>
							{visibleWeaponIds.map((weaponId) => {
								const weaponName = naming.name(weaponId);
								const slug = naming.slug(weaponId);

								return (
									<th key={weaponId} className={clsx(styles.weaponHeader, {})}>
										<Link
											to={weaponParamsPage(slug)}
											className={styles.weaponHeaderContent}
										>
											<WeaponParamImage kind={kind} id={weaponId} size={32} />
											<span className={styles.weaponName}>{weaponName}</span>
										</Link>
										{weaponId !== currentWeaponId ? (
											<SendouButton
												variant="minimal-destructive"
												size="miniscule"
												shape="square"
												icon={<X />}
												className={styles.hideButton}
												onPress={() => hideWeapon(weaponId)}
												aria-label={t("common:actions.hide")}
												testId={`hide-weapon-${weaponId}`}
											/>
										) : null}
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{kind === "main" && specialPoints ? (
							<SpecialPointsRow
								visibleWeaponIds={visibleWeaponIds}
								specialPoints={specialPoints}
								isExpanded={expandedRows.has(SPECIAL_POINTS_KEY)}
								onToggle={() => toggleRow(SPECIAL_POINTS_KEY)}
							/>
						) : null}
						{Object.entries(paramsByCategory).map(([category, params]) => {
							const filteredParams = params.filter(({ key }) =>
								currentWeaponHasParam(category, key),
							);

							if (filteredParams.length === 0) {
								return null;
							}

							return (
								<Fragment key={category}>
									<tr>
										<td
											colSpan={visibleWeaponIds.length + 1}
											className={styles.categoryHeader}
										>
											{category}
										</td>
									</tr>
									{filteredParams.map(({ key, fullKey }) => {
										const isExpanded = expandedRows.has(fullKey);
										const hasHistory = rowHasHistory(category, key);
										const explanation = getParamExplanation(category, key);

										return (
											<tr
												key={fullKey}
												className={clsx({
													[styles.expandableRow]: hasHistory,
												})}
											>
												<td
													className={styles.paramName}
													onClick={
														hasHistory ? () => toggleRow(fullKey) : undefined
													}
												>
													<div className={styles.paramNameInner}>
														<span className={styles.paramNameText}>{key}</span>
														{explanation ? (
															// biome-ignore lint/a11y/noStaticElementInteractions: stops the help popover click from toggling the history row
															<span
																className={styles.paramInfo}
																onClick={(e) => e.stopPropagation()}
															>
																<InfoPopover tiny>{explanation}</InfoPopover>
															</span>
														) : null}
														{hasHistory ? (
															<span className={styles.historyIndicator}>
																{isExpanded ? (
																	<ChevronUp size={14} />
																) : (
																	<ChevronDown size={14} />
																)}
															</span>
														) : null}
													</div>
												</td>
												{visibleWeaponIds.map((weaponId) => (
													<ParamCell
														key={weaponId}
														param={
															weaponParams[String(weaponId)]?.categories[
																category
															]?.[key]
														}
														isExpanded={isExpanded}
													/>
												))}
											</tr>
										);
									})}
								</Fragment>
							);
						})}
						{damageMultipliers ? (
							<DamageRateInfoSection
								visibleWeaponIds={visibleWeaponIds}
								currentWeaponId={currentWeaponId}
								damageMultipliers={damageMultipliers}
								expandedRows={expandedRows}
								onToggle={toggleRow}
							/>
						) : null}
					</tbody>
				</table>
			</div>
			<ParamsLegend />
		</>
	);
}

function ParamsLegend() {
	const { t } = useTranslation(["params"]);

	return (
		<dl className={styles.legend}>
			<dt className={styles.legendTitle}>{t("params:legend.title")}</dt>
			<dd className={styles.legendItem}>{t("params:legend.damage")}</dd>
			<dd className={styles.legendItem}>{t("params:legend.frames")}</dd>
			<dd className={styles.legendItem}>{t("params:legend.powerUp")}</dd>
		</dl>
	);
}

function DamageRateInfoSection({
	visibleWeaponIds,
	currentWeaponId,
	damageMultipliers,
	expandedRows,
	onToggle,
}: {
	visibleWeaponIds: number[];
	currentWeaponId: number;
	damageMultipliers: Record<string, DamageMultiplierWithHistory[]>;
	expandedRows: Set<string>;
	onToggle: (fullKey: string) => void;
}) {
	const { t } = useTranslation(["weapons", "analyzer", "game-misc"]);

	const targets = (damageMultipliers[String(currentWeaponId)] ?? []).map(
		(multiplier) => multiplier.target,
	);

	if (targets.length === 0) {
		return null;
	}

	const multiplierFor = (weaponId: number, target: string) =>
		damageMultipliers[String(weaponId)]?.find((m) => m.target === target);

	return (
		<Fragment>
			<tr>
				<td
					colSpan={visibleWeaponIds.length + 1}
					className={styles.categoryHeader}
				>
					{DAMAGE_RATE_INFO_CATEGORY}
				</td>
			</tr>
			{targets.map((target) => {
				const fullKey = `${DAMAGE_RATE_INFO_CATEGORY}.${target}`;
				const isExpanded = expandedRows.has(fullKey);
				const hasHistory = visibleWeaponIds.some(
					(id) => (multiplierFor(id, target)?.history.length ?? 0) > 0,
				);

				return (
					<tr
						key={fullKey}
						className={clsx({ [styles.expandableRow]: hasHistory })}
					>
						<td
							className={styles.paramName}
							onClick={hasHistory ? () => onToggle(fullKey) : undefined}
						>
							<div className={styles.paramNameInner}>
								<span className={styles.paramNameText}>
									{translateDamageReceiver(t, target as DamageReceiver)}
								</span>
								{hasHistory ? (
									<span className={styles.historyIndicator}>
										{isExpanded ? (
											<ChevronUp size={14} />
										) : (
											<ChevronDown size={14} />
										)}
									</span>
								) : null}
							</div>
						</td>
						{visibleWeaponIds.map((weaponId) => (
							<ParamCell
								key={weaponId}
								param={multiplierFor(weaponId, target)}
								isExpanded={isExpanded}
							/>
						))}
					</tr>
				);
			})}
		</Fragment>
	);
}

function HiddenWeaponsBar({
	kind,
	hiddenWeaponIds,
	onRestore,
	onShowAll,
}: {
	kind: WeaponParamKind;
	hiddenWeaponIds: number[];
	onRestore: (weaponId: number) => void;
	onShowAll: () => void;
}) {
	const { t } = useTranslation(["weapons", "common"]);
	const naming = useWeaponParamNaming(kind);

	return (
		<div className={styles.hiddenBar}>
			<EyeOff
				size={16}
				className={styles.hiddenBarLabel}
				aria-label="Show all"
			/>
			{hiddenWeaponIds.map((weaponId) => (
				<SendouButton
					key={weaponId}
					variant="minimal"
					size="miniscule"
					className={styles.hiddenBadge}
					onPress={() => onRestore(weaponId)}
					testId={`restore-weapon-${weaponId}`}
				>
					<WeaponParamImage kind={kind} id={weaponId} size={20} />
					<span className={styles.hiddenBadgeName}>
						{naming.name(weaponId)}
					</span>
					<X size={12} />
				</SendouButton>
			))}
			<SendouButton
				variant="minimal"
				size="miniscule"
				onPress={onShowAll}
				testId="show-all-weapons"
			>
				{t("common:actions.showAll")}
			</SendouButton>
		</div>
	);
}

function SpecialPointsRow({
	visibleWeaponIds,
	specialPoints,
	isExpanded,
	onToggle,
}: {
	visibleWeaponIds: number[];
	specialPoints: Record<string, SpecialPointWithHistory[]>;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["analyzer"]);

	const hasHistory = visibleWeaponIds.some((id) =>
		specialPoints[String(id)]?.some((kit) => kit.history.length > 0),
	);

	return (
		<tr className={clsx({ [styles.expandableRow]: hasHistory })}>
			<td
				className={styles.paramName}
				onClick={hasHistory ? onToggle : undefined}
			>
				<div className={styles.paramNameInner}>
					<span className={styles.paramNameText}>
						{t("analyzer:stat.specialPoints")}
					</span>
					{hasHistory ? (
						<span className={styles.historyIndicator}>
							{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
						</span>
					) : null}
				</div>
			</td>
			{visibleWeaponIds.map((weaponId) => (
				<SpecialPointCell
					key={weaponId}
					kits={specialPoints[String(weaponId)] ?? []}
					isExpanded={isExpanded}
				/>
			))}
		</tr>
	);
}

function SpecialPointCell({
	kits,
	isExpanded,
}: {
	kits: SpecialPointWithHistory[];
	isExpanded: boolean;
}) {
	const { t } = useTranslation(["analyzer"]);
	const suffix = t("analyzer:suffix.specialPointsShort");

	if (kits.length === 0) {
		return (
			<td className={styles.paramCell}>
				<span className={styles.noValue}>—</span>
			</td>
		);
	}

	const kitsWithHistory = kits.filter((kit) => kit.history.length > 0);
	const showHistory = isExpanded && kitsWithHistory.length > 0;

	return (
		<td className={styles.paramCell}>
			<div className={styles.cellContent}>
				<span className={styles.currentValue}>
					{kits.map((kit) => `${kit.current}${suffix}`).join(" / ")}
				</span>
				{kitsWithHistory.length > 0 && !isExpanded ? (
					<span className={styles.historyBadge}>{kitsWithHistory.length}</span>
				) : null}
			</div>
			{showHistory ? (
				<div className={styles.specialPointHistory}>
					{kitsWithHistory.map((kit) => (
						<div key={kit.weaponId} className={styles.specialPointHistoryKit}>
							<WeaponImage
								weaponSplId={kit.weaponId}
								variant="badge"
								size={24}
							/>
							<div className={styles.specialPointHistoryKitList}>
								{kit.history.toReversed().map(({ version, value }) => (
									<div key={version} className={styles.historyItem}>
										<span className={styles.historyValue}>
											{`${value}${suffix}`}
										</span>
										<span className={styles.historyVersion}>{version}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			) : null}
		</td>
	);
}

function ParamCell({
	param,
	isExpanded,
}: {
	param: ParamValueWithHistory | undefined;
	isExpanded: boolean;
}) {
	if (!param) {
		return (
			<td className={clsx(styles.paramCell)}>
				<span className={styles.noValue}>—</span>
			</td>
		);
	}

	const showHistory = isExpanded && param.history.length > 0;

	return (
		<td className={styles.paramCell}>
			<div className={styles.cellContent}>
				<span className={styles.currentValue}>
					{formatParamValue(param.current)}
				</span>
				{param.history.length > 0 && !isExpanded ? (
					<span className={styles.historyBadge}>{param.history.length}</span>
				) : null}
			</div>
			{showHistory ? (
				<div className={styles.historyList}>
					{param.history.toReversed().map(({ version, value }) => (
						<div key={version} className={styles.historyItem}>
							<span className={styles.historyValue}>
								{formatParamValue(value)}
							</span>
							<span className={styles.historyVersion}>{version}</span>
						</div>
					))}
				</div>
			) : null}
		</td>
	);
}
