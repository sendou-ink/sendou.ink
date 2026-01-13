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

type ThemeInputKey = (typeof COLOR_SLIDERS)[number]["inputKey"];

export const DEFAULT_THEME_INPUT: ThemeInput = {
	baseHue: 260,
	baseChroma: 0.012,
	accentHue: 270,
	accentChroma: 0.24,
};

export function themeInputFromCustomTheme(
	customTheme: CustomTheme,
): ThemeInput {
	return {
		baseHue: customTheme["--base-h"] ?? DEFAULT_THEME_INPUT.baseHue,
		baseChroma:
			(customTheme["--base-c-1"] ?? 0) / BASE_CHROMA_MULTIPLIERS[1] ||
			DEFAULT_THEME_INPUT.baseChroma,
		accentHue: customTheme["--acc-h"] ?? DEFAULT_THEME_INPUT.accentHue,
		accentChroma:
			(customTheme["--acc-c-1"] ?? 0) / ACCENT_CHROMA_MULTIPLIERS[1] ||
			DEFAULT_THEME_INPUT.accentChroma,
	};
}

function applyThemeInput(input: ThemeInput) {
	const clampedTheme = clampThemeToGamut(input);

	for (const [key, value] of Object.entries(clampedTheme)) {
		document.documentElement.style.setProperty(key, String(value));
	}
}

function ColorSlider({
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
	isHue: boolean;
	value: number;
	onChange: (inputKey: ThemeInputKey, value: number) => void;
}) {
	return (
		<div className={styles.colorSlider}>
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
			<div className={styles.colorSliders}>
				{COLOR_SLIDERS.map((slider) => (
					<ColorSlider
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
