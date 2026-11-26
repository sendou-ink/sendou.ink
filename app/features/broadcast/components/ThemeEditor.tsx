import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import {
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_WEAPON_IMAGES,
} from "../broadcast-constants";
import { BROADCAST_SHARED_SETTINGS } from "../broadcast-theme-sources";
import type { BroadcastWeaponImages } from "../broadcast-types";
import * as ThemeCss from "../core/ThemeCss";
import * as ThemeSettings from "../core/ThemeSettings";
import { Choice } from "./Choice";
import styles from "./ThemeEditor.module.css";

/** A theme as the designer saves it: the settings set in its form and the custom CSS. */
export interface Theme {
	css: string;
	variables: ThemeSettings.ThemeVariables;
}

/** A ready-made theme the editor loads in place of what is being edited. */
export interface ThemePreset extends Theme {
	key: string;
	label: string;
}

/** Settings of an overlay stylesheet, shown as a group titled after it. */
export interface StylesheetSettings {
	stylesheet: string;
	settings: ThemeSettings.ThemeSetting[];
}

/** The picker's options that aren't presets: the default styles, and the theme when it is no preset as it is. */
const DEFAULT_PRESET_KEY = "default";
const OWN_PRESET_KEY = "own";

/** The shared settings' group open to begin with. */
const OPEN_SHARED_GROUP = "colors";

/** The theme being edited, its custom CSS as typed along with the last of it that parsed. */
export interface ThemeDraft {
	text: string;
	/** What the preview shows and is saved, the text as of the last time it parsed. */
	css: string;
	error: ThemeCss.CssError | null;
	variables: ThemeSettings.ThemeVariables;
}

/** The editor's draft of the theme starting from the saved one, and whether it has changed or can't be saved. */
export function useThemeDraft(saved: Theme) {
	const [draft, setDraft] = React.useState(() => draftOf(saved));
	const isChanged =
		draft.text !== saved.css ||
		!R.isDeepEqual(draft.variables, saved.variables);
	const hasErrors =
		draft.error !== null ||
		Object.values(draft.variables).some(
			(value) => !ThemeSettings.isValidValue(value),
		);

	return { draft, setDraft, isChanged, hasErrors };
}

/**
 * Editor of a scene set's theme, top to bottom: a preset to start from, the settings (theme variables as form
 * inputs, the ones of every scene and the ones of the scene previewed) and under "Advanced" the custom CSS, with the
 * default CSS of the scene previewed to copy from. A preset picked replaces the settings and custom CSS with its own.
 */
export function ThemeEditor({
	presets,
	draft,
	setDraft,
	weaponImages,
	setWeaponImages,
	everywhereSettings,
	sceneLabel,
	sceneSettings,
	sceneDefaultCss,
	fonts,
	isTooLong,
}: {
	presets: ThemePreset[];
	draft: ThemeDraft;
	setDraft: React.Dispatch<React.SetStateAction<ThemeDraft>>;
	weaponImages: BroadcastWeaponImages;
	setWeaponImages: (weaponImages: BroadcastWeaponImages) => void;
	/** Settings of parts showing over every scene besides the shared ones, e.g. the stinger's. */
	everywhereSettings: StylesheetSettings[];
	sceneLabel: string;
	/** Settings of the stylesheets of the scene previewed. */
	sceneSettings: StylesheetSettings[];
	/** The default styles of the scene previewed as theme CSS, read-only to copy from. */
	sceneDefaultCss: string;
	/** Font families the overlays have, suggested for the font settings. */
	fonts: readonly string[];
	isTooLong: boolean;
}) {
	const { t } = useTranslation(["broadcast", "common", "forms"]);
	/** The preset picked over a theme of one's own, loaded once confirmed. */
	const [presetToConfirm, setPresetToConfirm] =
		React.useState<ThemePreset | null>(null);
	const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(
		() => draft.text !== "",
	);
	const fontListId = React.useId();

	const presetOptions: ThemePreset[] = [
		{
			key: DEFAULT_PRESET_KEY,
			label: t("broadcast:design.preset.default"),
			css: "",
			variables: {},
		},
		...presets,
	];
	// custom CSS that doesn't parse is being worked on, whatever its last text that did is
	const loadedPreset =
		draft.error || draft.text !== draft.css
			? undefined
			: presetOptions.find(
					(preset) =>
						preset.css === draft.css &&
						R.isDeepEqual(preset.variables, draft.variables),
				);

	const loadPreset = (preset: ThemePreset) => {
		setDraft(draftOf(preset));
		setPresetToConfirm(null);
	};

	const pickPreset = (key: string) => {
		const preset = presetOptions.find((candidate) => candidate.key === key);
		if (!preset || preset === loadedPreset) return;

		if (loadedPreset) {
			loadPreset(preset);
		} else {
			setPresetToConfirm(preset);
		}
	};

	const setVariable = (name: string, value: string | null) =>
		setDraft((current) => ({
			...current,
			variables:
				value === null
					? R.omit(current.variables, [name])
					: { ...current.variables, [name]: value },
		}));

	const editCss = (text: string) =>
		setDraft((current) => {
			const error = ThemeCss.syntaxError(text);

			return { ...current, text, error, css: error ? current.css : text };
		});

	const fieldOf = (setting: ThemeSettings.ThemeSetting, label: string) => (
		<SettingField
			key={setting.name}
			setting={setting}
			label={label}
			value={draft.variables[setting.name]}
			onChange={(value) => setVariable(setting.name, value)}
			fontListId={fontListId}
		/>
	);

	const savedCss = [draft.css, ThemeSettings.block(draft.variables)]
		.filter(Boolean)
		.join("\n\n");

	return (
		<section className={clsx("stack md-plus", styles.editor)}>
			<Choice
				label={t("broadcast:design.preset")}
				value={loadedPreset?.key ?? OWN_PRESET_KEY}
				options={[
					...presetOptions.map((preset) => ({
						value: preset.key,
						label: preset.label,
					})),
					...(loadedPreset
						? []
						: [
								{
									value: OWN_PRESET_KEY,
									label: t("broadcast:design.preset.own"),
								},
							]),
				]}
				onChange={pickPreset}
			/>
			<SendouDialog
				isOpen={presetToConfirm !== null}
				heading={t("broadcast:design.presetConfirm.heading")}
				onClose={() => setPresetToConfirm(null)}
			>
				<div className="stack md">
					<p className="text-sm text-lighter">
						{t("broadcast:design.presetConfirm.description", {
							preset: presetToConfirm?.label,
						})}
					</p>
					<div className="stack horizontal sm justify-end">
						<SendouButton
							variant="outlined"
							onClick={() => setPresetToConfirm(null)}
						>
							{t("common:actions.cancel")}
						</SendouButton>
						<SendouButton
							variant="destructive"
							onClick={() => {
								if (presetToConfirm) loadPreset(presetToConfirm);
							}}
							testId="broadcast-design-preset-confirm"
						>
							{t("broadcast:design.presetConfirm.submit")}
						</SendouButton>
					</div>
				</div>
			</SendouDialog>

			<datalist id={fontListId}>
				{fonts.map((font) => (
					<option key={font} value={font} />
				))}
			</datalist>

			<section className="stack md">
				<h2 className={styles.heading}>
					{t("broadcast:design.settings.everywhere")}
				</h2>
				<Choice
					label={t("forms:labels.broadcastWeaponImages")}
					value={weaponImages}
					options={BROADCAST_WEAPON_IMAGES.map((option) => ({
						value: option,
						label: t(`forms:options.broadcastWeaponImages.${option}`),
					}))}
					onChange={setWeaponImages}
				/>
				{BROADCAST_SHARED_SETTINGS.map(({ group, settings }) => (
					<SettingsGroup
						key={group}
						title={t(`broadcast:design.settings.group.${group}`)}
						defaultOpen={group === OPEN_SHARED_GROUP}
					>
						{settings.map((setting) =>
							fieldOf(setting, t(`broadcast:design.setting.${setting.key}`)),
						)}
					</SettingsGroup>
				))}
				{everywhereSettings.map(({ stylesheet, settings }) => (
					<SettingsGroup key={stylesheet} title={humanize(stylesheet)}>
						{settings.map((setting) =>
							fieldOf(setting, labelOf(setting, settings)),
						)}
					</SettingsGroup>
				))}
			</section>

			<section className="stack md">
				<h2 className={styles.heading}>
					{t("broadcast:design.settings.scene", { scene: sceneLabel })}
				</h2>
				{sceneSettings.length === 0 ? (
					<p className="text-sm text-lighter">
						{t("broadcast:design.settings.sceneNone")}
					</p>
				) : null}
				{sceneSettings.map(({ stylesheet, settings }, i) => (
					<SettingsGroup
						key={stylesheet}
						title={humanize(stylesheet)}
						defaultOpen={i === 0}
					>
						{settings.map((setting) =>
							fieldOf(setting, labelOf(setting, settings)),
						)}
					</SettingsGroup>
				))}
			</section>

			<details
				className={styles.advanced}
				open={isAdvancedOpen}
				onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}
			>
				<summary className={styles.heading}>
					{t("broadcast:design.advanced")}
				</summary>
				<div className="stack md mt-3">
					<FormMessage type="info" spaced={false}>
						{t("broadcast:design.customHint")}
					</FormMessage>
					<div className="stack xs">
						<textarea
							className={styles.code}
							value={draft.text}
							onChange={(event) => editCss(event.currentTarget.value)}
							onKeyDown={insertTabOnTab}
							spellCheck={false}
							autoCapitalize="off"
							autoComplete="off"
							aria-label={t("broadcast:design.custom")}
							data-testid="broadcast-design-editor"
						/>
						{draft.error ? (
							<p className="text-xs text-error" role="alert">
								{t("broadcast:design.syntaxError", {
									line: draft.error.line,
									reason: draft.error.reason,
								})}
							</p>
						) : null}
					</div>
					<details className={styles.result}>
						<summary className="text-sm font-semi-bold">
							{t("broadcast:design.defaultCss", { scene: sceneLabel })}
						</summary>
						<textarea
							className={clsx(styles.code, styles.readOnly)}
							value={sceneDefaultCss}
							readOnly
							spellCheck={false}
							aria-label={t("broadcast:design.defaultCss", {
								scene: sceneLabel,
							})}
						/>
					</details>
					<details className={styles.result}>
						<summary className="text-sm font-semi-bold">
							{t("broadcast:design.result", {
								length: draft.css.length,
								max: BROADCAST_CSS_MAX_LENGTH,
							})}
						</summary>
						<pre className={styles.code}>
							{savedCss || t("broadcast:design.noChanges")}
						</pre>
					</details>
				</div>
			</details>
			{isTooLong ? (
				<p className="text-xs text-error" role="alert">
					{t("broadcast:design.tooLong", { max: BROADCAST_CSS_MAX_LENGTH })}
				</p>
			) : null}
		</section>
	);
}

function SettingsGroup({
	title,
	defaultOpen = false,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = React.useState(defaultOpen);

	return (
		<details
			className={styles.group}
			open={isOpen}
			onToggle={(event) => setIsOpen(event.currentTarget.open)}
		>
			<summary className="text-sm font-semi-bold">{title}</summary>
			<div className={styles.fields}>{children}</div>
		</details>
	);
}

/**
 * A setting's input, empty while it isn't set (showing its default) and with a button resetting it. A value the
 * input can't show as its kind (a color picker can't show a gradient, say) is shown as text.
 */
function SettingField({
	setting,
	label,
	value,
	onChange,
	fontListId,
}: {
	setting: ThemeSettings.ThemeSetting;
	label: string;
	value: string | undefined;
	onChange: (value: string | null) => void;
	fontListId: string;
}) {
	const { t } = useTranslation(["broadcast"]);
	const id = React.useId();
	const isInvalid = value !== undefined && !ThemeSettings.isValidValue(value);
	const shown = value ?? setting.defaultValue;

	const onText = (text: string) => onChange(text.trim() ? text : null);

	const input = () => {
		const textInput = (
			<input
				id={id}
				className="in-container"
				value={value ?? ""}
				placeholder={setting.defaultValue}
				onChange={(event) => onText(event.currentTarget.value)}
				list={setting.kind === "font" ? fontListId : undefined}
				spellCheck={false}
				aria-invalid={isInvalid || undefined}
			/>
		);

		switch (setting.kind) {
			case "color": {
				return (
					<>
						<span
							className={styles.swatch}
							style={{ background: isInvalid ? undefined : shown }}
						>
							<input
								type="color"
								value={hexOf(shown) ?? "#000000"}
								onChange={(event) => onChange(event.currentTarget.value)}
								aria-label={t("broadcast:design.settings.pickColor", {
									name: label,
								})}
								tabIndex={-1}
							/>
						</span>
						{textInput}
					</>
				);
			}
			case "number": {
				const number =
					value === undefined
						? null
						: ThemeSettings.numberOf(value, setting.unit);
				if (value !== undefined && number === null) return textInput;

				return (
					<>
						<input
							id={id}
							className="in-container"
							type="number"
							value={number ?? ""}
							placeholder={String(
								ThemeSettings.numberOf(setting.defaultValue, setting.unit) ??
									setting.defaultValue,
							)}
							step={stepOf(setting)}
							onChange={(event) => {
								const typed = event.currentTarget.value;
								onChange(
									typed === ""
										? null
										: ThemeSettings.numberValue(Number(typed), setting.unit),
								);
							}}
						/>
						{setting.unit ? (
							<span className={styles.unit}>{setting.unit}</span>
						) : null}
					</>
				);
			}
			case "image": {
				const url = value === undefined ? "" : ThemeSettings.imageUrlOf(value);
				if (url === null) return textInput;

				return (
					<input
						id={id}
						className="in-container"
						type="url"
						value={url}
						placeholder={t("broadcast:design.settings.imageUrl")}
						onChange={(event) => {
							const typed = event.currentTarget.value.trim();
							onChange(typed ? ThemeSettings.imageValue(typed) : null);
						}}
					/>
				);
			}
			default:
				return textInput;
		}
	};

	return (
		<div
			className={styles.field}
			data-testid={`broadcast-setting-${setting.name}`}
		>
			<label htmlFor={id} className={styles.label} title={setting.name}>
				{label}
				{setting.hint ? (
					<span className="text-xxs text-lighter">{setting.hint}</span>
				) : null}
			</label>
			<div className={styles.control}>
				<div
					className={clsx("input-container", styles.input, {
						[styles.invalid]: isInvalid,
					})}
				>
					{input()}
				</div>
				<SendouButton
					size="small"
					variant="minimal"
					shape="square"
					icon={<RotateCcw />}
					className={clsx({ [styles.unset]: value === undefined })}
					onClick={() => onChange(null)}
					aria-label={t("broadcast:design.settings.reset", {
						name: label,
						value: setting.defaultValue,
					})}
					title={t("broadcast:design.settings.reset", {
						name: label,
						value: setting.defaultValue,
					})}
				/>
			</div>
		</div>
	);
}

/** Tab indents instead of moving focus, `insertText` keeping it undoable. */
function insertTabOnTab(event: React.KeyboardEvent<HTMLTextAreaElement>) {
	if (
		event.key !== "Tab" ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey
	) {
		return;
	}

	event.preventDefault();
	document.execCommand("insertText", false, "\t");
}

function draftOf(theme: Theme): ThemeDraft {
	const error = ThemeCss.syntaxError(theme.css);

	return {
		text: theme.css,
		css: error ? "" : theme.css,
		error,
		variables: theme.variables,
	};
}

/** A stylesheet's setting labeled by its name, the part all of the stylesheet's share (`--game-`) left out. */
function labelOf(
	setting: ThemeSettings.ThemeSetting,
	settings: ThemeSettings.ThemeSetting[],
) {
	const prefix =
		settings.length > 1
			? commonPrefix(settings.map((candidate) => candidate.name))
			: setting.name.slice(0, setting.name.lastIndexOf("-") + 1);
	const name = setting.name.slice(prefix.lastIndexOf("-") + 1);

	return humanize(name || setting.name.replace(/^--/, ""));
}

function commonPrefix(names: string[]) {
	return names.reduce((prefix, name) => {
		let i = 0;
		while (i < prefix.length && prefix[i] === name[i]) i++;

		return prefix.slice(0, i);
	});
}

/** `GameScene` or `bar-height` as words: "Game scene", "Bar height". */
function humanize(name: string) {
	const words = name
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replaceAll("-", " ")
		.toLowerCase();

	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The color as `#rrggbb` for the color picker, `null` when it isn't a hex color. */
function hexOf(color: string) {
	const hex = /^#([\da-f]{3,8})$/i.exec(color.trim())?.[1];
	if (!hex) return null;
	if (hex.length === 3 || hex.length === 4) {
		return `#${Array.from(hex.slice(0, 3), (digit) => digit + digit).join("")}`;
	}
	if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;

	return null;
}

function stepOf(setting: ThemeSettings.ThemeSetting) {
	switch (setting.unit) {
		case "ms":
			return 10;
		case "s":
			return 0.1;
		case "px":
			return 1;
		default:
			return Number(setting.defaultValue) % 100 === 0 ? 100 : "any";
	}
}
