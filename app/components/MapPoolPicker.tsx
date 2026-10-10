import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image } from "~/components/Image";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { modeImageUrl, stageBannerImageUrl } from "~/utils/urls";
import styles from "./MapPoolPicker.module.css";

/** A preset offered in the picker's quick fill row. */
export type MapPoolQuickFill = { label: string; mapPool: MapPool };

/** Picks stages of a map pool, one tab per mode. */
export function MapPoolPicker({
	mapPool,
	onChange,
	quickFill,
	modes = modesShort,
	sendouQFilter,
	disabled,
	"aria-label": ariaLabel,
}: {
	mapPool: MapPool;
	onChange: (mapPool: MapPool) => void;
	/** Shows a quick fill row with these presets plus clearing and pasting a map pool link. Presets apply only to an empty pool. */
	quickFill?: MapPoolQuickFill[];
	/** Limits the pool to these modes, default every mode. */
	modes?: readonly ModeShort[];
	/** Shows a toggle below the picker that limits the listed stages to the ones legal in SendouQ. */
	sendouQFilter?: boolean;
	disabled?: boolean;
	"aria-label"?: string;
}) {
	const { t } = useTranslation(["game-misc", "forms", "common"]);
	const id = React.useId();
	const [isSendouQLegalOnly, setIsSendouQLegalOnly] = React.useState(false);
	const [
		isSendouQIllegalRemovalConfirmOpen,
		setIsSendouQIllegalRemovalConfirmOpen,
	] = React.useState(false);

	const [selectedMode, setSelectedMode] = React.useState(() =>
		initialMode(mapPool, modes),
	);
	const shownMode = modes.includes(selectedMode) ? selectedMode : modes[0];

	const handleChange = (newMapPool: MapPool) => {
		onChange(
			new MapPool(
				newMapPool.stageModePairs.filter((pair) => modes.includes(pair.mode)),
			),
		);
	};

	const toggleStage = (mode: ModeShort, stageId: StageId) => {
		const stages = mapPool.parsed[mode];

		handleChange(
			new MapPool({
				...mapPool.parsed,
				[mode]: stages.includes(stageId)
					? stages.filter((poolStageId) => poolStageId !== stageId)
					: [...stages, stageId],
			}),
		);
	};

	const sendouQIllegalPairs = mapPool.stageModePairs.filter(
		(pair) => !SENDOUQ_MAP_POOL.has(pair),
	);

	const enableSendouQLegalOnly = () => {
		setIsSendouQLegalOnly(true);
		handleChange(
			new MapPool(
				mapPool.stageModePairs.filter((pair) => SENDOUQ_MAP_POOL.has(pair)),
			),
		);
	};

	const handleSendouQLegalOnlyChange = (isLegalOnly: boolean) => {
		if (!isLegalOnly) {
			setIsSendouQLegalOnly(false);
		} else if (sendouQIllegalPairs.length > 0) {
			setIsSendouQIllegalRemovalConfirmOpen(true);
		} else {
			enableSendouQLegalOnly();
		}
	};

	const tabKey = (mode: ModeShort) => `${id}-${mode}`;

	return (
		<div className={styles.root}>
			{quickFill ? (
				<QuickFillRow
					presets={quickFill}
					disabled={disabled}
					isPoolEmpty={mapPool.isEmpty()}
					onFill={handleChange}
				/>
			) : null}
			<SendouTabs
				className={styles.tabs}
				selectedKey={tabKey(shownMode)}
				onSelectionChange={(key) =>
					setSelectedMode(
						modes.find((mode) => tabKey(mode) === key) ?? shownMode,
					)
				}
			>
				<SendouTabList aria-label={ariaLabel}>
					{modes.map((mode) => (
						<SendouTab
							key={mode}
							id={tabKey(mode)}
							icon={
								<Image
									path={modeImageUrl(mode)}
									alt=""
									width={18}
									height={18}
								/>
							}
						>
							{t(`game-misc:MODE_LONG_${mode}`)}
							<span className={styles.count}>
								{mapPool.countMapsByMode(mode)}
							</span>
						</SendouTab>
					))}
				</SendouTabList>
				{modes.map((mode) => (
					<SendouTabPanel key={mode} id={tabKey(mode)}>
						<div className={styles.stages}>
							{stageIds
								.filter(
									(stageId) =>
										!isSendouQLegalOnly ||
										SENDOUQ_MAP_POOL.has({ stageId, mode }),
								)
								.map((stageId) => (
									<label
										key={stageId}
										className={styles.stage}
										style={
											{
												"--stage-banner": `url(${stageBannerImageUrl(stageId)})`,
											} as React.CSSProperties
										}
									>
										<input
											type="checkbox"
											checked={mapPool.has({ stageId, mode })}
											onChange={() => toggleStage(mode, stageId)}
											disabled={disabled}
										/>
										{t(`game-misc:STAGE_${stageId}`)}
									</label>
								))}
						</div>
					</SendouTabPanel>
				))}
			</SendouTabs>
			{sendouQFilter ? (
				<>
					<SendouSwitch
						size="small"
						isSelected={isSendouQLegalOnly}
						onChange={handleSendouQLegalOnlyChange}
						isDisabled={disabled}
					>
						{t("forms:mapPool.sendouQLegalOnly")}
					</SendouSwitch>
					<FormWithConfirm
						isOpen={isSendouQIllegalRemovalConfirmOpen}
						onOpenChange={setIsSendouQIllegalRemovalConfirmOpen}
						dialogHeading={t("forms:mapPool.sendouQLegalOnlyConfirm")}
						description={sendouQIllegalPairs
							.map(
								(pair) =>
									`${t(`game-misc:MODE_SHORT_${pair.mode}`)} ${t(`game-misc:STAGE_${pair.stageId}`)}`,
							)
							.join(", ")}
						submitButtonText={t("common:actions.remove")}
						onConfirm={enableSendouQLegalOnly}
					/>
				</>
			) : null}
		</div>
	);
}

/** The quick fill presets offered everywhere a map pool is picked: SendouQ's pool and every stage in the ranked modes. */
export function useMapPoolQuickFill(): MapPoolQuickFill[] {
	const { t } = useTranslation(["forms"]);

	return [
		{
			label: t("forms:mapPool.quickFill.sendouQ"),
			mapPool: new MapPool(
				SENDOUQ_MAP_POOL.stageModePairs.filter((pair) => pair.mode !== "TW"),
			),
		},
		{
			label: t("forms:mapPool.quickFill.rankedModes"),
			mapPool: MapPool.ANARCHY,
		},
	];
}

function QuickFillRow({
	presets,
	disabled,
	isPoolEmpty,
	onFill,
}: {
	presets: MapPoolQuickFill[];
	disabled?: boolean;
	isPoolEmpty: boolean;
	onFill: (mapPool: MapPool) => void;
}) {
	const { t } = useTranslation(["forms", "common"]);
	const [isPasteOpen, setIsPasteOpen] = React.useState(false);

	return (
		<div className={styles.quickFill}>
			<span className={styles.quickFillLabel}>
				{t("forms:mapPool.quickFill")}
			</span>
			{presets.map((preset) => (
				<SendouButton
					key={preset.label}
					variant="outlined"
					size="small"
					className={styles.quickFillButton}
					isDisabled={disabled || !isPoolEmpty}
					onClick={() => onFill(preset.mapPool)}
				>
					{preset.label}
				</SendouButton>
			))}
			<FormWithConfirm
				dialogHeading={t("forms:mapPool.clearConfirm")}
				submitButtonText={t("common:actions.clear")}
				onConfirm={() => onFill(MapPool.EMPTY)}
			>
				<SendouButton
					variant="outlined-destructive"
					size="small"
					className={styles.quickFillButton}
					isDisabled={disabled || isPoolEmpty}
				>
					{t("common:actions.clear")}
				</SendouButton>
			</FormWithConfirm>
			<SendouPopover
				isOpen={isPasteOpen}
				onOpenChange={setIsPasteOpen}
				popoverClassName={styles.pastePopover}
				trigger={
					<SendouButton
						variant="outlined"
						size="small"
						className={styles.quickFillButton}
						isDisabled={disabled || !isPoolEmpty}
					>
						{t("forms:mapPool.pasteLink")}
					</SendouButton>
				}
			>
				<PasteMapPoolLink
					onPaste={(mapPool) => {
						onFill(mapPool);
						setIsPasteOpen(false);
					}}
				/>
			</SendouPopover>
		</div>
	);
}

function PasteMapPoolLink({
	onPaste,
}: {
	onPaste: (mapPool: MapPool) => void;
}) {
	const { t } = useTranslation(["forms"]);
	const id = React.useId();
	const [link, setLink] = React.useState("");

	const isInvalid = link.trim() !== "" && !MapPool.fromUserInput(link);

	const handleChange = (newLink: string) => {
		setLink(newLink);

		const mapPool = MapPool.fromUserInput(newLink);
		if (mapPool) onPaste(mapPool);
	};

	return (
		<div className={styles.paste}>
			<label htmlFor={id}>{t("forms:mapPool.pasteLinkLabel")}</label>
			<input
				id={id}
				value={link}
				data-autofocus
				placeholder={t("forms:placeholders.scrimMapPool")}
				onChange={(event) => handleChange(event.target.value)}
				// the popover may sit inside a form, enter would submit it
				onKeyDown={(event) => {
					if (event.key === "Enter") event.preventDefault();
				}}
			/>
			{isInvalid ? (
				<FormMessage type="error">
					{t("forms:errors.invalidMapPool")}
				</FormMessage>
			) : null}
		</div>
	);
}

function initialMode(mapPool: MapPool, modes: readonly ModeShort[]) {
	return (
		modes.find((mode) => mapPool.hasMode(mode)) ??
		modes.find((mode) => mode !== "TW") ??
		modes[0]
	);
}
