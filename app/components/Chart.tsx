import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import {
	CartesianGrid,
	Line,
	LineChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import styles from "./Chart.module.css";

interface ChartLine {
	dataKey: string;
	label: React.ReactNode;
}

interface ChartProps {
	data: Array<Record<string, number | Date>>;
	lines: ChartLine[];
	xAxisKey?: string;
	valueSuffix?: string;
	headerSuffix?: string;
	containerClassName?: string;
}

interface ChartTooltipProps {
	active?: boolean;
	payload?: Array<{
		value?: number;
		stroke?: string;
		dataKey?: string;
	}>;
	label?: string | number | Date;
	lines: ChartLine[];
	valueSuffix?: string;
	headerSuffix?: string;
}

const LINE_COLORS = ["var(--color-text-accent)", "var(--color-text-second)"];

export function Chart({
	data,
	lines,
	xAxisKey = "x",
	valueSuffix,
	headerSuffix,
	containerClassName,
}: ChartProps) {
	const { i18n } = useTranslation();

	const formatXAxis = (value: number | Date) => {
		if (value instanceof Date) {
			return value.toLocaleDateString(i18n.language, {
				day: "numeric",
				month: "numeric",
			});
		}

		return String(value);
	};

	return (
		<div className={clsx(styles.container, containerClassName)}>
			<LineChart data={data} responsive className={styles.chart}>
				<XAxis
					interval={3}
					height={24}
					dataKey={xAxisKey}
					tickMargin={8}
					tickFormatter={formatXAxis}
					padding={{ left: 0, right: 10 }}
					tick={{ fill: "oklab(from var(--color-text) l a b / 0.5)" }}
					stroke="oklab(from var(--color-text) l a b / 0.25)"
				/>
				<YAxis
					width="auto"
					tickMargin={8}
					minTickGap={12}
					padding={{ top: 10, bottom: 0 }}
					domain={["auto", "auto"]}
					tick={{ fill: "oklab(from var(--color-text) l a b / 0.5)" }}
					stroke="oklab(from var(--color-text) l a b / 0.25)"
				/>
				<Tooltip
					content={
						<ChartTooltip
							lines={lines}
							valueSuffix={valueSuffix}
							headerSuffix={headerSuffix}
						/>
					}
					cursor={false}
				/>
				<CartesianGrid
					syncWithTicks={true}
					stroke="oklab(from var(--color-text) l a b / 0.05)"
				/>
				{lines.map((line, index) => (
					<Line
						animationDuration={500}
						key={line.dataKey}
						type="monotone"
						dataKey={line.dataKey}
						stroke={LINE_COLORS[index % LINE_COLORS.length]}
						strokeWidth={2}
						dot={false}
						activeDot={{
							r: 6,
							strokeWidth: 2,
							stroke: "var(--color-bg)",
							fill: LINE_COLORS[index % LINE_COLORS.length],
						}}
					/>
				))}
			</LineChart>
		</div>
	);
}

function ChartTooltip({
	active,
	payload,
	label,
	lines,
	valueSuffix = "",
	headerSuffix = "",
}: ChartTooltipProps) {
	const { formatDate } = useTimeFormat();

	if (!active || !payload || payload.length === 0) {
		return null;
	}

	const formatHeader = () => {
		if (label instanceof Date) {
			return formatDate(label, {
				weekday: "short",
				day: "numeric",
				month: "long",
			});
		}

		return label + headerSuffix;
	};

	return (
		<div className={styles.tooltip}>
			<h3 className="text-center text-sm">{formatHeader()}</h3>
			{payload.map((entry, index) => {
				const color = entry.stroke ?? LINE_COLORS[index % LINE_COLORS.length];
				const line = lines.find((l) => l.dataKey === entry.dataKey);

				return (
					<div
						key={entry.dataKey}
						className="stack horizontal items-center sm text-xs"
					>
						<div
							className={styles.dot}
							style={{
								backgroundColor: color,
							}}
						/>
						<div>{line?.label}</div>
						<div className={styles.tooltipValue}>
							{entry.value}
							{valueSuffix}
						</div>
					</div>
				);
			})}
		</div>
	);
}
