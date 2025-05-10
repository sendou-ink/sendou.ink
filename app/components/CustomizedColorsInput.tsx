import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import { CUSTOM_CSS_VAR_COLORS } from "~/constants";
import { Button } from "./Button";
import { Label } from "./Label";

type CustomColorsRecord = Partial<
	Record<(typeof CUSTOM_CSS_VAR_COLORS)[number], string>
>;

type ContrastCombination = [
	Exclude<(typeof CUSTOM_CSS_VAR_COLORS)[number], "bg-lightest">,
	Exclude<(typeof CUSTOM_CSS_VAR_COLORS)[number], "bg-lightest">,
];

type ContrastArray = {
	colors: ContrastCombination;
	contrast: {
		AA: { failed: boolean; ratio: string };
		AAA: { failed: boolean; ratio: string };
	};
}[];

export function CustomizedColorsInput({
	initialColors,
}: {
	initialColors?: Record<string, string> | null;
}) {
	const { t } = useTranslation();
	const [colors, setColors] = React.useState<CustomColorsRecord>(
		initialColors ?? {},
	);

	const [defaultColors, setDefaultColors] = React.useState<
		Record<string, string>[]
	>([]);
	const [contrasts, setContrast] = React.useState<ContrastArray>([]);

	useDebounce(
		() => {
			for (const color in colors) {
				const value =
					colors[color as (typeof CUSTOM_CSS_VAR_COLORS)[number]] ?? "";
				document.body.style.setProperty(`--${color}`, value);
			}

			setContrast(handleContrast(defaultColors, colors));
		},
		100,
		[colors],
	);

	React.useEffect(() => {
		const colors = CUSTOM_CSS_VAR_COLORS.map((color) => {
			return {
				[color]: getComputedStyle(document.body).getPropertyValue(`--${color}`),
			};
		});
		setDefaultColors(colors);

		return () => {
			document.body.removeAttribute("style");
			for (const color in initialColors) {
				const value =
					initialColors[color as (typeof CUSTOM_CSS_VAR_COLORS)[number]] ?? "";
				document.body.style.setProperty(`--${color}`, value);
			}
		};
	}, [initialColors]);

	return (
		<div className="w-full">
			<Label>{t("custom.colors.title")}</Label>
			<input type="hidden" name="css" value={JSON.stringify(colors)} />
			<div className="colors__grid">
				{CUSTOM_CSS_VAR_COLORS.filter((cssVar) => cssVar !== "bg-lightest").map(
					(cssVar) => {
						return (
							<React.Fragment key={cssVar}>
								<div>{t(`custom.colors.${cssVar}`)}</div>
								<input
									type="color"
									className="plain"
									value={colors[cssVar] ?? "#000000"}
									onChange={(e) => {
										const extras: Record<string, string> = {};
										if (cssVar === "bg-lighter") {
											extras["bg-lightest"] = `${e.target.value}80`;
										}
										setColors({
											...colors,
											...extras,
											[cssVar]: e.target.value,
										});
									}}
									data-testid={`color-input-${cssVar}`}
								/>
								<Button
									size="tiny"
									variant="minimal-destructive"
									onClick={() => {
										const newColors: Record<string, string | undefined> = {
											...colors,
										};
										if (cssVar === "bg-lighter") {
											newColors["bg-lightest"] = undefined;
										}
										setColors({ ...newColors, [cssVar]: undefined });
									}}
								>
									{t("actions.reset")}
								</Button>
							</React.Fragment>
						);
					},
				)}
			</div>
			<Label>{t("custom.colors.contrast.title")}</Label>
			<div className="colors__grid colors__grid-extended">
				<div>{t("custom.colors.contrast.first-color")}</div>
				<div>{t("custom.colors.contrast.second-color")}</div>
				<div>AA</div>
				<div>AAA</div>
				{contrasts.map((contrast) => {
					return (
						<React.Fragment key={contrast.colors.join("-")}>
							<div>{t(`custom.colors.${contrast.colors[0]}`)}</div>
							<div>{t(`custom.colors.${contrast.colors[1]}`)}</div>
							<div
								className={`colors__contrast ${
									contrast.contrast.AA.failed ? "fail" : "success"
								}`}
							>
								{contrast.contrast.AA.ratio}
							</div>
							<div
								className={`colors__contrast ${
									contrast.contrast.AAA.failed ? "fail" : "success"
								}`}
							>
								{contrast.contrast.AAA.ratio}
							</div>
						</React.Fragment>
					);
				})}
			</div>
			<pre className="colors__description">
				{t("custom.colors.contrast.description")}
			</pre>
		</div>
	);
}

function handleContrast(
	defaultColors: Record<string, string>[],
	colors: CustomColorsRecord,
) {
	/* 
	Excluded because bg-lightest is not visible to the user, 
	tho these should be checked as well:
	["bg-lightest", "text"],
	["bg-lightest", "theme-secondary"],
	*/
	const combinations: ContrastCombination[] = [
		["bg", "text"],
		["bg", "text-lighter"],
		["bg-darker", "text"],
		["bg-darker", "theme"],
		["bg-lighter", "text-lighter"],
		["bg-lighter", "theme"],
	];

	const results: ContrastArray = [];

	for (const [A, B] of combinations) {
		const valueA =
			colors[A as (typeof CUSTOM_CSS_VAR_COLORS)[number]] ?? undefined;
		const valueB =
			colors[B as (typeof CUSTOM_CSS_VAR_COLORS)[number]] ?? undefined;

		const colorA = valueA ?? defaultColors.find((color) => color[A])?.[A];
		const colorB = valueB ?? defaultColors.find((color) => color[B])?.[B];

		if (!colorA || !colorB) continue;

		const parsedA = colorA.includes("rgb") ? parseCSSVar(colorA) : colorA;
		const parsedB = colorB.includes("rgb") ? parseCSSVar(colorB) : colorB;

		results.push({
			colors: [A, B],
			contrast: checkContrast(parsedA, parsedB),
		});
	}

	return results;
}

function parseCSSVar(cssVar: string) {
	const regex = /rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s+\/\s+(\d+%?))?\)/;
	const match = cssVar.match(regex);

	if (!match) {
		return "#000000";
	}

	const r = Number.parseInt(match[1], 10);
	const g = Number.parseInt(match[2], 10);
	const b = Number.parseInt(match[3], 10);

	let alpha = 255;
	if (match[4]) {
		const percentage = Number.parseInt(match[4], 10);
		alpha = Math.round((percentage / 100) * 255);
	}

	const toHex = (value: number) => {
		const hex = value.toString(16);
		return hex.length === 1 ? `0${hex}` : hex;
	};

	if (match[4]) {
		return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`;
	}

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function checkContrast(colorA: string, colorB: string) {
	const rgb1 = hexToRgb(colorA);
	const rgb2 = hexToRgb(colorB);

	const luminanceA = calculateLuminance(rgb1);
	const luminanceB = calculateLuminance(rgb2);

	const light = Math.max(luminanceA, luminanceB);
	const dark = Math.min(luminanceA, luminanceB);
	const ratio = (light + 0.05) / (dark + 0.05);

	return {
		AA: {
			failed: ratio < 4.5,
			ratio: ratio.toFixed(2),
		},
		AAA: {
			failed: ratio < 7,
			ratio: ratio.toFixed(2),
		},
	};
}

function hexToRgb(hex: string) {
	const noHash = hex.replace(/^#/, "");

	const r = Number.parseInt(noHash.substring(0, 2), 16);
	const g = Number.parseInt(noHash.substring(2, 4), 16);
	const b = Number.parseInt(noHash.substring(4, 6), 16);

	if (noHash.length === 8) {
		const alpha = Number.parseInt(noHash.substring(6, 8), 16) / 255;
		return [
			Math.round(r * alpha),
			Math.round(g * alpha),
			Math.round(b * alpha),
		];
	}

	return [r, g, b];
}

function calculateLuminance(rgb: number[]) {
	const [r, g, b] = rgb.map((value) => {
		const normalized = value / 255;

		return normalized <= 0.03928
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
