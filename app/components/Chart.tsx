import clsx from "clsx";
import * as React from "react";
import { type AxisOptions, Chart as ReactChart } from "react-charts";
import type { TooltipRendererProps } from "react-charts/types/components/TooltipRenderer";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./Chart.module.css";

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
	const theme = useTheme();
	const isHydrated = useHydrated();
	const { formatter: scaleFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
	});

	const primaryAxis = React.useMemo<
		AxisOptions<(typeof options)[number]["data"][number]>
	>(
		// @ts-expect-error - some weirdness here but maybe not worth fixing as the whole library needs to be replaced (it is unmaintained/deprecated)
		() => ({
			getValue: (datum) => datum.primary,
			scaleType: xAxis,
			shouldNice: false,
			formatters: {
				scale: (val: any) => {
					if (val instanceof Date) {
						return scaleFormatter.format(val);
					}

					return val;
				},
			},
		}),
		[scaleFormatter, xAxis],
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

	if (!isHydrated) {
		return <div className={clsx(styles.container, containerClassName)} />;
	}

	return (
		<div className={clsx(styles.container, containerClassName)}>
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
						"var(--color-text-accent)",
						"var(--color-accent)",
						"var(--color-info)",
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
	const { formatter: headerFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
		month: "numeric",
	});
	const dataPoints = focusedDatum?.interactiveGroup ?? [];

	const header = () => {
		const primaryValue = dataPoints[0]?.primaryValue;
		if (!primaryValue) return null;

		if (primaryValue instanceof Date) {
			return headerFormatter.format(primaryValue);
		}

		return primaryValue;
	};

	return (
		<div className={styles.tooltip}>
			<h3 className="text-center text-md">
				{header()}
				{headerSuffix}
			</h3>
			{dataPoints.map((dataPoint, index) => {
				const color = dataPoint.style?.fill ?? "var(--color-accent)";

				return (
					<div key={index} className="stack horizontal items-center sm">
						<div
							className={clsx(styles.dot, {
								[styles.dotFocused]:
									focusedDatum?.seriesId === dataPoint.seriesId,
							})}
							style={{
								"--dot-color": color,
								"--dot-color-outline": color.replace(")", "-transparent)"),
							}}
						/>
						<div>{dataPoint.originalSeries.label}</div>
						<div className={styles.tooltipValue}>
							{dataPoint.secondaryValue}
							{valueSuffix}
						</div>
					</div>
				);
			})}
		</div>
	);
}
