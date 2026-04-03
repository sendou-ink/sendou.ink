import { Check, Clipboard, PencilLine } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
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
import { THEME_INPUT_LIMITS, themeInputSchema } from "~/utils/zod";
import styles from "./CustomThemeSelector.module.css";
import { Divider } from "./Divider";
import { LinkButton, SendouButton } from "./elements/Button";
import { SendouSwitch } from "./elements/Switch";
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
	| (typeof SIZE_SLIDERS)[number]["inputKey"]
	| "chatHue";

const THEME_STRING_KEYS: readonly ThemeInputKey[] = [
	...COLOR_SLIDERS.map((s) => s.inputKey),
	...RADIUS_SLIDERS.map((s) => s.inputKey),
	...BORDER_SLIDERS.map((s) => s.inputKey),
	...SIZE_SLIDERS.map((s) => s.inputKey),
	"chatHue",
];

function themeInputToString(input: ThemeInput): string {
	return THEME_STRING_KEYS.map((key) => {
		const value = input[key];
		return value === null ? "_" : String(value);
	}).join(";");
}

function themeInputFromString(str: string): ThemeInput | null {
	const parts = str.split(";");
	if (parts.length !== THEME_STRING_KEYS.length) return null;

	const raw: Record<string, number | null> = {};
	for (let i = 0; i < THEME_STRING_KEYS.length; i++) {
		const key = THEME_STRING_KEYS[i];
		const part = parts[i].trim();

		if (key === "chatHue" && part === "_") {
			raw[key] = null;
			continue;
		}

		const num = Number(part);
		if (Number.isNaN(num)) return null;
		raw[key] = num;
	}

	const parsed = themeInputSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

const DEFAULT_THEME_INPUT: ThemeInput = {
	baseHue: 268,
	baseChroma: 0.05,
	accentHue: 253,
	accentChroma: 0.24,
	chatHue: null,
	radiusBox: 3,
	radiusField: 2,
	radiusSelector: 2,
	borderWidth: 2,
	sizeField: 1,
	sizeSelector: 1,
	sizeSpacing: 1,
};

function themeInputFromCustomTheme(customTheme: CustomTheme): ThemeInput {
	return {
		baseHue: customTheme["--_base-h"] ?? DEFAULT_THEME_INPUT.baseHue,
		baseChroma:
			typeof customTheme["--_base-c-2"] === "number"
				? customTheme["--_base-c-2"] / BASE_CHROMA_MULTIPLIERS[2]
				: DEFAULT_THEME_INPUT.baseChroma,
		accentHue: customTheme["--_acc-h"] ?? DEFAULT_THEME_INPUT.accentHue,
		accentChroma:
			typeof customTheme["--_acc-c-2"] === "number"
				? customTheme["--_acc-c-2"] / ACCENT_CHROMA_MULTIPLIERS[2]
				: DEFAULT_THEME_INPUT.accentChroma,
		chatHue: customTheme["--_chat-h"],
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
	isPersonalTheme,
	onSave,
	onReset,
	hidePatreonInfo,
	fetcherState,
}: {
	initialTheme: CustomTheme | null | undefined;
	isSupporter: boolean;
	isPersonalTheme: boolean;
	onSave: (themeInput: ThemeInput) => void;
	onReset: () => void;
	hidePatreonInfo?: boolean;
	fetcherState?: "idle" | "submitting" | "loading";
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

	const chatHueEnabled = themeInput.chatHue !== null;

	const handleChatHueToggle = (isSelected: boolean) => {
		const updatedInput = {
			...themeInput,
			chatHue: isSelected ? 0 : null,
		};
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
				{isPersonalTheme ? (
					<div className="mt-2">
						<SendouSwitch
							isSelected={chatHueEnabled}
							onChange={handleChatHueToggle}
						>
							{t("common:settings.customTheme.chatHueToggle")}
						</SendouSwitch>
					</div>
				) : null}
				{chatHueEnabled && isPersonalTheme ? (
					<div className={styles.chatColorPreview}>
						<ThemeSlider
							id="chat-hue"
							inputKey="chatHue"
							min={THEME_INPUT_LIMITS.BASE_HUE_MIN}
							max={THEME_INPUT_LIMITS.BASE_HUE_MAX}
							step={1}
							label={t("common:settings.customTheme.chatHue")}
							isHue
							value={themeInput.chatHue ?? 0}
							onChange={handleSliderChange}
						/>
					</div>
				) : null}
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
			{isPersonalTheme ? (
				<>
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
					<Divider smallText>
						{t("common:settings.customTheme.borders")}
					</Divider>
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
				</>
			) : null}
			<Divider />
			<ThemeShareInput
				themeInput={themeInput}
				onImport={(imported) => {
					setThemeInput(imported);
					applyThemeInput(imported);
				}}
			/>
			<div className={styles.customThemeSelectorActions}>
				<SendouButton
					isDisabled={
						!isSupporter || (fetcherState != null && fetcherState !== "idle")
					}
					onPress={handleSave}
				>
					{t("common:actions.save")}
				</SendouButton>
				<SendouButton
					isDisabled={
						!isSupporter || (fetcherState != null && fetcherState !== "idle")
					}
					variant="destructive"
					onPress={handleReset}
				>
					{t("common:actions.reset")}
				</SendouButton>
			</div>
		</div>
	);
}

function ThemeShareInput({
	themeInput,
	onImport,
}: {
	themeInput: ThemeInput;
	onImport: (input: ThemeInput) => void;
}) {
	const { t } = useTranslation(["common"]);
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);

	const themeString = themeInputToString(themeInput);

	React.useEffect(() => {
		if (!state.value) return;

		setCopySuccess(true);
		const timeout = setTimeout(() => setCopySuccess(false), 2000);

		return () => clearTimeout(timeout);
	}, [state]);

	const handlePaste = async () => {
		const text = await navigator.clipboard.readText();
		const parsed = themeInputFromString(text);
		if (parsed) onImport(parsed);
	};

	return (
		<div className={styles.themeShare}>
			<Label htmlFor="theme-input">
				{t("common:settings.customTheme.shareCode")}
			</Label>
			<div className={styles.themeShareActions}>
				<input id="theme-input" type="text" value={themeString} readOnly />
				<SendouButton
					shape="square"
					variant="outlined"
					icon={copySuccess ? <Check /> : <Clipboard />}
					onPress={() => copyToClipboard(themeString)}
					aria-label={t("common:settings.customTheme.copy")}
				/>
				<SendouButton
					shape="square"
					variant="outlined"
					icon={<PencilLine />}
					onPress={handlePaste}
					aria-label={t("common:settings.customTheme.paste")}
				/>
			</div>
		</div>
	);
}
