import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	CUSTOM_THEME_VARS,
	type CustomTheme,
	type CustomThemeVar,
} from "~/db/tables";
import {
	ACCENT_CHROMA_MULTIPLIERS,
	BASE_CHROMA_MULTIPLIERS,
	clampThemeToGamut,
	type ThemeInput,
} from "~/utils/oklch-gamut";
import { THEME_INPUT_LIMITS } from "~/utils/zod";
import styles from "./CustomThemeSelector.module.css";
import { Divider } from "./Divider";
import { LinkButton, SendouButton } from "./elements/Button";
import { Label } from "./Label";

const COLOR_SLIDERS = [
	{
		id: "base-hue",
		inputKey: "baseHue",
		min: THEME_INPUT_LIMITS.BASE_HUE_MIN,
		max: THEME_INPUT_LIMITS.BASE_HUE_MAX,
		step: 1,
		labelKey: "baseHue",
		isHue: true,
	},
	{
		id: "base-chroma",
		inputKey: "baseChroma",
		min: THEME_INPUT_LIMITS.BASE_CHROMA_MIN,
		max: THEME_INPUT_LIMITS.BASE_CHROMA_MAX,
		step: 0.001,
		labelKey: "baseChroma",
		isHue: false,
	},
	{
		id: "accent-hue",
		inputKey: "accentHue",
		min: THEME_INPUT_LIMITS.ACCENT_HUE_MIN,
		max: THEME_INPUT_LIMITS.ACCENT_HUE_MAX,
		step: 1,
		labelKey: "accentHue",
		isHue: true,
	},
	{
		id: "accent-chroma",
		inputKey: "accentChroma",
		min: THEME_INPUT_LIMITS.ACCENT_CHROMA_MIN,
		max: THEME_INPUT_LIMITS.ACCENT_CHROMA_MAX,
		step: 0.01,
		labelKey: "accentChroma",
		isHue: false,
	},
] as const;

const RADIUS_SLIDERS = [
	{
		id: "radius-box",
		inputKey: "radiusBox",
		min: THEME_INPUT_LIMITS.RADIUS_MIN,
		max: THEME_INPUT_LIMITS.RADIUS_MAX,
		step: THEME_INPUT_LIMITS.RADIUS_STEP,
		labelKey: "boxes",
	},
	{
		id: "radius-field",
		inputKey: "radiusField",
		min: THEME_INPUT_LIMITS.RADIUS_MIN,
		max: THEME_INPUT_LIMITS.RADIUS_MAX,
		step: THEME_INPUT_LIMITS.RADIUS_STEP,
		labelKey: "fields",
	},
	{
		id: "radius-selector",
		inputKey: "radiusSelector",
		min: THEME_INPUT_LIMITS.RADIUS_MIN,
		max: THEME_INPUT_LIMITS.RADIUS_MAX,
		step: THEME_INPUT_LIMITS.RADIUS_STEP,
		labelKey: "selectors",
	},
] as const;

const BORDER_SLIDERS = [
	{
		id: "border-width",
		inputKey: "borderWidth",
		min: THEME_INPUT_LIMITS.BORDER_WIDTH_MIN,
		max: THEME_INPUT_LIMITS.BORDER_WIDTH_MAX,
		step: THEME_INPUT_LIMITS.BORDER_WIDTH_STEP,
		labelKey: "borderWidth",
	},
] as const;

const SIZE_SLIDERS = [
	{
		id: "size-field",
		inputKey: "sizeField",
		min: THEME_INPUT_LIMITS.SIZE_MIN,
		max: THEME_INPUT_LIMITS.SIZE_MAX,
		step: THEME_INPUT_LIMITS.SIZE_STEP,
		labelKey: "fields",
	},
	{
		id: "size-selector",
		inputKey: "sizeSelector",
		min: THEME_INPUT_LIMITS.SIZE_MIN,
		max: THEME_INPUT_LIMITS.SIZE_MAX,
		step: THEME_INPUT_LIMITS.SIZE_STEP,
		labelKey: "selectors",
	},
	{
		id: "size-spacing",
		inputKey: "sizeSpacing",
		min: THEME_INPUT_LIMITS.SIZE_MIN,
		max: THEME_INPUT_LIMITS.SIZE_MAX,
		step: THEME_INPUT_LIMITS.SIZE_STEP,
		labelKey: "spacings",
	},
] as const;

type ThemeInputKey =
	| (typeof COLOR_SLIDERS)[number]["inputKey"]
	| (typeof RADIUS_SLIDERS)[number]["inputKey"]
	| (typeof BORDER_SLIDERS)[number]["inputKey"]
	| (typeof SIZE_SLIDERS)[number]["inputKey"];

export const DEFAULT_THEME_INPUT: ThemeInput = {
	baseHue: 260,
	baseChroma: 0.012,
	accentHue: 270,
	accentChroma: 0.24,
	radiusBox: 3,
	radiusField: 2,
	radiusSelector: 2,
	borderWidth: 2,
	sizeField: 1,
	sizeSelector: 1,
	sizeSpacing: 1,
};

export function themeInputFromCustomTheme(
	customTheme: CustomTheme,
): ThemeInput {
	return {
		baseHue: customTheme["--_base-h"] ?? DEFAULT_THEME_INPUT.baseHue,
		baseChroma:
			(customTheme["--_base-c-1"] ?? 0) / BASE_CHROMA_MULTIPLIERS[1] ||
			DEFAULT_THEME_INPUT.baseChroma,
		accentHue: customTheme["--_acc-h"] ?? DEFAULT_THEME_INPUT.accentHue,
		accentChroma:
			(customTheme["--_acc-c-1"] ?? 0) / ACCENT_CHROMA_MULTIPLIERS[1] ||
			DEFAULT_THEME_INPUT.accentChroma,
		radiusBox: customTheme["--_radius-box"] ?? DEFAULT_THEME_INPUT.radiusBox,
		radiusField:
			customTheme["--_radius-field"] ?? DEFAULT_THEME_INPUT.radiusField,
		radiusSelector:
			customTheme["--_radius-selector"] ?? DEFAULT_THEME_INPUT.radiusSelector,
		borderWidth:
			customTheme["--_border-width"] ?? DEFAULT_THEME_INPUT.borderWidth,
		sizeField: customTheme["--_size-field"] ?? DEFAULT_THEME_INPUT.sizeField,
		sizeSelector:
			customTheme["--_size-selector"] ?? DEFAULT_THEME_INPUT.sizeSelector,
		sizeSpacing:
			customTheme["--_size-spacing"] ?? DEFAULT_THEME_INPUT.sizeSpacing,
	};
}

function applyThemeInput(input: ThemeInput) {
	const clampedTheme = clampThemeToGamut(input);

	for (const [key, value] of Object.entries(clampedTheme)) {
		document.documentElement.style.setProperty(key, String(value));
	}
}

function ThemeSlider({
	id,
	inputKey,
	min,
	max,
	step,
	label,
	isHue,
	value,
	onChange,
}: {
	id: string;
	inputKey: ThemeInputKey;
	min: number;
	max: number;
	step: number;
	label: string;
	isHue?: boolean;
	value: number;
	onChange: (inputKey: ThemeInputKey, value: number) => void;
}) {
	return (
		<div className={styles.themeSliderRow}>
			<Label htmlFor={id}>{label}</Label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(inputKey, Number(e.target.value))}
				className={isHue ? styles.hueSlider : undefined}
			/>
		</div>
	);
}

export function CustomThemeSelector({
	initialTheme,
	isSupporter,
	onSave,
	onReset,
	hidePatreonInfo,
}: {
	initialTheme: CustomTheme | null | undefined;
	isSupporter: boolean;
	onSave: (themeInput: ThemeInput) => void;
	onReset: () => void;
	hidePatreonInfo?: boolean;
}) {
	const { t } = useTranslation(["common"]);

	const initialThemeInput = initialTheme
		? themeInputFromCustomTheme(initialTheme)
		: DEFAULT_THEME_INPUT;

	const [themeInput, setThemeInput] =
		React.useState<ThemeInput>(initialThemeInput);

	const handleSliderChange = (inputKey: ThemeInputKey, value: number) => {
		const updatedInput = { ...themeInput, [inputKey]: value };
		setThemeInput(updatedInput);
		applyThemeInput(updatedInput);
	};

	const handleSave = () => {
		onSave(themeInput);
	};

	const handleReset = () => {
		setThemeInput(DEFAULT_THEME_INPUT);
		CUSTOM_THEME_VARS.forEach((varDef: CustomThemeVar) => {
			document.documentElement.style.removeProperty(varDef);
		});
		onReset();
	};

	return (
		<div className={styles.customThemeSelector}>
			{hidePatreonInfo ? null : (
				<div
					className={
						isSupporter
							? styles.customThemeSelectorSupporter
							: styles.customThemeSelectorNoSupporter
					}
				>
					<div className={styles.customThemeSelectorInfo}>
						<p>{t("common:settings.customTheme.patreonText")}</p>
						<LinkButton
							to="https://www.patreon.com/sendou"
							isExternal
							size="small"
						>
							{t("common:settings.customTheme.joinPatreon")}
						</LinkButton>
					</div>
				</div>
			)}
			<Divider smallText>{t("common:settings.customTheme.colors")}</Divider>
			<div className={styles.themeSliders}>
				{COLOR_SLIDERS.map((slider) => (
					<ThemeSlider
						key={slider.id}
						id={slider.id}
						inputKey={slider.inputKey}
						min={slider.min}
						max={slider.max}
						step={slider.step}
						label={t(`common:settings.customTheme.${slider.labelKey}`)}
						isHue={slider.isHue}
						value={themeInput[slider.inputKey]}
						onChange={handleSliderChange}
					/>
				))}
			</div>
			<Divider smallText>{t("common:settings.customTheme.radius")}</Divider>
			<div className={styles.themeSliders}>
				{RADIUS_SLIDERS.map((slider) => (
					<ThemeSlider
						key={slider.id}
						id={slider.id}
						inputKey={slider.inputKey}
						min={slider.min}
						max={slider.max}
						step={slider.step}
						label={t(`common:settings.customTheme.${slider.labelKey}`)}
						value={themeInput[slider.inputKey]}
						onChange={handleSliderChange}
					/>
				))}
			</div>
			<Divider smallText>{t("common:settings.customTheme.sizes")}</Divider>
			<div className={styles.themeSliders}>
				{SIZE_SLIDERS.map((slider) => (
					<ThemeSlider
						key={slider.id}
						id={slider.id}
						inputKey={slider.inputKey}
						min={slider.min}
						max={slider.max}
						step={slider.step}
						label={t(`common:settings.customTheme.${slider.labelKey}`)}
						value={themeInput[slider.inputKey]}
						onChange={handleSliderChange}
					/>
				))}
			</div>
			<Divider smallText>{t("common:settings.customTheme.borders")}</Divider>
			<div className={styles.themeSliders}>
				{BORDER_SLIDERS.map((slider) => (
					<ThemeSlider
						key={slider.id}
						id={slider.id}
						inputKey={slider.inputKey}
						min={slider.min}
						max={slider.max}
						step={slider.step}
						label={t(`common:settings.customTheme.${slider.labelKey}`)}
						value={themeInput[slider.inputKey]}
						onChange={handleSliderChange}
					/>
				))}
			</div>
			<div className={styles.customThemeSelectorActions}>
				<SendouButton isDisabled={!isSupporter} onPress={handleSave}>
					{t("common:actions.save")}
				</SendouButton>
				<SendouButton
					isDisabled={!isSupporter}
					variant="destructive"
					onPress={handleReset}
				>
					{t("common:actions.reset")}
				</SendouButton>
			</div>
		</div>
	);
}
