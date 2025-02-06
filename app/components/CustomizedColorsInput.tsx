import * as React from "react";
import { useTranslation } from "react-i18next";
import { CUSTOM_CSS_VAR_COLORS } from "~/constants";
import { Button } from "./Button";
import { Label } from "./Label";

type CustomColorsRecord = Partial<
	Record<(typeof CUSTOM_CSS_VAR_COLORS)[number], string>
>;

export function CustomizedColorsInput({
	initialColors,
}: {
	initialColors?: Record<string, string> | null;
}) {
	const { t } = useTranslation();
	const [colors, setColors] = React.useState<CustomColorsRecord>(
		initialColors ?? {},
	);

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
									value={colors[cssVar]}
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
		</div>
	);
}
