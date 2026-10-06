import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
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
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { modeImageUrl, stageBannerImageUrl } from "~/utils/urls";
import type { FormFieldProps, MapPoolFieldOptions } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";
import styles from "./MapPoolFormField.module.css";

type MapPoolFormFieldProps = FormFieldProps<"map-pool"> &
	MapPoolFieldOptions & {
		value: string;
		onChange: (value: string) => void;
		disabled?: boolean;
	};

export function MapPoolFormField({
	name,
	label,
	bottomText,
	error,
	onBlur,
	value,
	onChange,
	disabled,
	quickFill,
	modes = modesShort,
}: MapPoolFormFieldProps) {
	const { t } = useTranslation(["forms", "game-misc"]);
	const id = React.useId();

	const mapPool = value ? new MapPool(value) : MapPool.EMPTY;

	const [selectedMode, setSelectedMode] = React.useState(() =>
		initialMode(mapPool, modes),
	);
	const shownMode = modes.includes(selectedMode) ? selectedMode : modes[0];

	const handleChange = (newMapPool: MapPool) => {
		const serialized = new MapPool(
			newMapPool.stageModePairs.filter((pair) => modes.includes(pair.mode)),
		).serialized;

		onChange(serialized);
		onBlur(serialized);
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

	const tabKey = (mode: ModeShort) => `${id}-${mode}`;

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
		>
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
					<SendouTabList aria-label={label ? t(label as never) : undefined}>
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
								{stageIds.map((stageId) => (
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
			</div>
		</FormFieldWrapper>
	);
}

function QuickFillRow({
	presets,
	disabled,
	isPoolEmpty,
	onFill,
}: {
	presets: NonNullable<MapPoolFieldOptions["quickFill"]>;
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
				// the popover sits inside the form, enter would submit it
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
