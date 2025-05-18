import clsx from "clsx";
import * as React from "react";
import { type AxisOptions, Chart as ReactChart } from "react-charts";
import type { TooltipRendererProps } from "react-charts/types/components/TooltipRenderer";
import { useTranslation } from "react-i18next";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { useIsMounted } from "~/hooks/useIsMounted";

export default function Chart({
	options,
	containerClassName,
	headerSuffix,
	valueSuffix,
	xAxis,
}: {
	options: [
		{ label: string; data: Array<{ primary: Date; secondary: number }> },
	];
	containerClassName?: string;
	headerSuffix?: string;
	valueSuffix?: string;
	xAxis: "linear" | "localTime";
}) {
	const { i18n } = useTranslation();
	const theme = useTheme();
	const isMounted = useIsMounted();

	const primaryAxis = React.useMemo<
		AxisOptions<(typeof options)[number]["data"][number]>
	>(
		// @ts-expect-error TODO: type this
		() => ({
			getValue: (datum) => datum.primary,
			scaleType: xAxis,
			shouldNice: false,
			formatters: {
				scale: (val: any) => {
					if (val instanceof Date) {
						return val.toLocaleDateString(i18n.language, {
							day: "numeric",
							month: "numeric",
						});
					}

					return val;
				},
			},
		}),
		[i18n.language, xAxis],
	);

	const secondaryAxes = React.useMemo<
		AxisOptions<(typeof options)[number]["data"][number]>[]
	>(
		() => [
			{
				getValue: (datum) => datum.secondary,
			},
		],
		[],
	);

	if (!isMounted) {
		return <div className={clsx("chart__container", containerClassName)} />;
	}

	return (
		<div className={clsx("chart__container", containerClassName)}>
			<ReactChart
				options={{
					data: options,
					tooltip: {
						render: (props) => (
							<ChartTooltip
								{...props}
								headerSuffix={headerSuffix}
								valueSuffix={valueSuffix}
							/>
						),
					},
					primaryCursor: false,
					secondaryCursor: false,
					primaryAxis,
					secondaryAxes,
					dark: theme.htmlThemeClass === Theme.DARK,
					defaultColors: [
						"var(--theme)",
						"var(--theme-secondary)",
						"var(--theme-info)",
					],
				}}
			/>
		</div>
	);
}

interface ChartTooltipProps extends TooltipRendererProps<any> {
	headerSuffix?: string;
	valueSuffix?: string;
}

function ChartTooltip({
	focusedDatum,
	headerSuffix = "",
	valueSuffix = "",
}: ChartTooltipProps) {
	const { i18n } = useTranslation();
	const dataPoints = focusedDatum?.interactiveGroup ?? [];

	const header = () => {
		const primaryValue = dataPoints[0]?.primaryValue;
		if (!primaryValue) return null;

		if (primaryValue instanceof Date) {
			return primaryValue.toLocaleDateString(i18n.language, {
				weekday: "short",
				day: "numeric",
				month: "long",
			});
		}

		return primaryValue;
	};

	return (
		<div className="chart__tooltip">
			<h3 className="text-center text-md">
				{header()}
				{headerSuffix}
			</h3>
			{dataPoints.map((dataPoint, index) => {
				const color = dataPoint.style?.fill ?? "var(--theme)";

				return (
					<div key={index} className="stack horizontal items-center sm">
						<div
							className={clsx("chart__dot", {
								chart__dot__focused:
									focusedDatum?.seriesId === dataPoint.seriesId,
							})}
							style={{
								"--dot-color": color,
								"--dot-color-outline": color.replace(")", "-transparent)"),
							}}
						/>
						<div className="chart__tooltip__label">
							{dataPoint.originalSeries.label}
						</div>
						<div className="chart__tooltip__value">
							{dataPoint.secondaryValue}
							{valueSuffix}
						</div>
					</div>
				);
			})}
		</div>
	);
}
