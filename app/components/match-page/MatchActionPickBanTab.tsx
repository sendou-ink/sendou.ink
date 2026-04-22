import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { stageImageUrl } from "~/utils/urls";
import { Divider } from "../Divider";
import { SendouTabPanel } from "../elements/Tabs";
import { ModeImage } from "../Image";
import styles from "./MatchActionPickBanTab.module.css";
import { TAB_KEYS } from "./MatchTabs";
import { WeaponReporter, type WeaponReporterProps } from "./WeaponReporter";

interface PickBanMapOption {
	stageId?: StageId;
	mode?: ModeShort;
	picker?: "US" | "THEM" | "BOTH";
	nth?: number;
}

interface PickBanSubmission {
	type: "PICK" | "BAN";
	map: PickBanMapOption;
}

interface MatchActionPickBanTabProps {
	options: PickBanMapOption[];
	type: "PICK" | "BAN";
	onSubmit?: (data: PickBanSubmission) => void;
	isSubmitting?: boolean;
	weaponReport?: WeaponReporterProps;
}

export function MatchActionPickBanTab({
	options,
	type,
	onSubmit,
	isSubmitting,
	weaponReport,
}: MatchActionPickBanTabProps) {
	const { t } = useTranslation(["q", "common", "game-misc"]);
	const [selected, setSelected] = useState<PickBanMapOption>();

	const hasStage = options.every((option) => option.stageId !== undefined);
	const hasMode = options.every((option) => option.mode !== undefined);
	const layout: "STAGE_BY_MODE" | "STAGE_ONLY" | "MODE_ONLY" =
		hasStage && hasMode
			? "STAGE_BY_MODE"
			: hasStage
				? "STAGE_ONLY"
				: "MODE_ONLY";

	const titleKey =
		layout === "MODE_ONLY"
			? type === "PICK"
				? "q:match.action.pickMode"
				: "q:match.action.banMode"
			: type === "PICK"
				? "q:match.action.pickStage"
				: "q:match.action.banStage";

	const selectedLabel = (() => {
		if (!selected) return null;
		const stageName =
			selected.stageId !== undefined
				? t(`game-misc:STAGE_${selected.stageId}`)
				: null;
		const modeName =
			selected.mode !== undefined
				? t(
						selected.stageId !== undefined
							? `game-misc:MODE_SHORT_${selected.mode}`
							: `game-misc:MODE_LONG_${selected.mode}`,
					)
				: null;
		if (stageName && modeName) return `${stageName} (${modeName})`;
		return stageName ?? modeName;
	})();

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.root}>
				<div className={styles.title}>{t(titleKey)}</div>

				<div className={styles.options}>
					{layout === "STAGE_BY_MODE" ? (
						<StageByModeGrid
							options={options}
							type={type}
							selected={selected}
							onSelect={setSelected}
						/>
					) : layout === "STAGE_ONLY" ? (
						<StageOnlyGrid
							options={options}
							type={type}
							selected={selected}
							onSelect={setSelected}
						/>
					) : (
						<ModeOnlyGrid
							options={options}
							type={type}
							selected={selected}
							onSelect={setSelected}
						/>
					)}
				</div>

				<p className={styles.prompt}>
					{selectedLabel ? (
						<>
							<span
								className={type === "PICK" ? styles.verbPick : styles.verbBan}
							>
								{type === "PICK"
									? t("q:match.action.picking")
									: t("q:match.action.banning")}
							</span>{" "}
							{selectedLabel}
						</>
					) : (
						t("q:match.action.pickBanPrompt")
					)}
				</p>

				<SendouButton
					variant="primary"
					className={styles.submit}
					isDisabled={!selected || isSubmitting}
					onPress={() => {
						if (!selected) return;
						onSubmit?.({ type, map: selected });
					}}
				>
					{t("common:actions.submit")}
				</SendouButton>
			</div>
			{weaponReport ? <WeaponReporter {...weaponReport} /> : null}
		</SendouTabPanel>
	);
}

function StageByModeGrid({
	options,
	type,
	selected,
	onSelect,
}: {
	options: PickBanMapOption[];
	type: "PICK" | "BAN";
	selected?: PickBanMapOption;
	onSelect: (option: PickBanMapOption) => void;
}) {
	const modesInOrder: ModeShort[] = [];
	const byMode = new Map<ModeShort, PickBanMapOption[]>();
	for (const option of options) {
		const mode = option.mode!;
		if (!byMode.has(mode)) {
			byMode.set(mode, []);
			modesInOrder.push(mode);
		}
		byMode.get(mode)!.push(option);
	}

	return (
		<>
			{modesInOrder.map((mode) => (
				<div key={mode} className={styles.modeGroup}>
					<Divider className={styles.divider}>
						<ModeImage mode={mode} size={32} />
					</Divider>
					<div className={styles.stageGrid}>
						{byMode.get(mode)!.map((option) => (
							<StageTile
								key={`${option.stageId}-${option.mode}`}
								option={option}
								type={type}
								isSelected={isSameOption(option, selected)}
								onSelect={() => onSelect(option)}
							/>
						))}
					</div>
				</div>
			))}
		</>
	);
}

function StageOnlyGrid({
	options,
	type,
	selected,
	onSelect,
}: {
	options: PickBanMapOption[];
	type: "PICK" | "BAN";
	selected?: PickBanMapOption;
	onSelect: (option: PickBanMapOption) => void;
}) {
	return (
		<div className={styles.stageGrid}>
			{options.map((option) => (
				<StageTile
					key={option.stageId}
					option={option}
					type={type}
					isSelected={isSameOption(option, selected)}
					onSelect={() => onSelect(option)}
				/>
			))}
		</div>
	);
}

function ModeOnlyGrid({
	options,
	type,
	selected,
	onSelect,
}: {
	options: PickBanMapOption[];
	type: "PICK" | "BAN";
	selected?: PickBanMapOption;
	onSelect: (option: PickBanMapOption) => void;
}) {
	return (
		<div className={styles.modeGrid}>
			{options.map((option) => (
				<ModeTile
					key={option.mode}
					option={option}
					type={type}
					isSelected={isSameOption(option, selected)}
					onSelect={() => onSelect(option)}
				/>
			))}
		</div>
	);
}

// xxx: maybe we should just have a shared custom component for stage image + label
function StageTile({
	option,
	type,
	isSelected,
	onSelect,
}: {
	option: PickBanMapOption;
	type: "PICK" | "BAN";
	isSelected: boolean;
	onSelect: () => void;
}) {
	const { t } = useTranslation(["q", "game-misc"]);

	return (
		<div className={styles.tileContainer}>
			<div className={styles.tileWrapper}>
				<button
					type="button"
					className={clsx(styles.tile, styles.stageTile, {
						[styles.tileSelected]: isSelected,
					})}
					style={{
						"--map-image-url": `url("${stageImageUrl(option.stageId!)}.avif")`,
					}}
					onClick={onSelect}
				/>
				{isSelected ? (
					type === "PICK" ? (
						<Check className={clsx(styles.tileIcon, styles.tileIconPick)} />
					) : (
						<X className={clsx(styles.tileIcon, styles.tileIconBan)} />
					)
				) : null}
				{option.nth ? (
					<span className={styles.tileNumber}>{option.nth}</span>
				) : null}
			</div>
			<div className={styles.tileLabel}>
				{shortStageName(t(`game-misc:STAGE_${option.stageId!}`))}
			</div>
			{option.picker ? (
				<span
					className={clsx(styles.tileFrom, {
						"text-theme": option.picker === "BOTH",
						"text-success": option.picker === "US",
						"text-error": option.picker === "THEM",
					})}
				>
					{option.picker === "US"
						? t("q:match.action.pickerUs")
						: option.picker === "THEM"
							? t("q:match.action.pickerThem")
							: t("q:match.action.pickerBoth")}
				</span>
			) : null}
		</div>
	);
}

function ModeTile({
	option,
	type,
	isSelected,
	onSelect,
}: {
	option: PickBanMapOption;
	type: "PICK" | "BAN";
	isSelected: boolean;
	onSelect: () => void;
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className={styles.tileContainer}>
			<div className={styles.tileWrapper}>
				<button
					type="button"
					className={clsx(styles.tile, styles.modeTile, {
						[styles.tileSelected]: isSelected,
					})}
					onClick={onSelect}
				>
					<ModeImage mode={option.mode!} size={48} />
				</button>
				{isSelected ? (
					type === "PICK" ? (
						<Check className={clsx(styles.tileIcon, styles.tileIconPick)} />
					) : (
						<X className={clsx(styles.tileIcon, styles.tileIconBan)} />
					)
				) : null}
			</div>
			<div className={styles.tileLabel}>
				{t(`game-misc:MODE_LONG_${option.mode!}`)}
			</div>
		</div>
	);
}

function isSameOption(a: PickBanMapOption, b: PickBanMapOption | undefined) {
	if (!b) return false;
	return a.stageId === b.stageId && a.mode === b.mode;
}
