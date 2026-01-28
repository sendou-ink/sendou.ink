import { useTranslation } from "react-i18next";
import {
	Line,
	LineChart,
	ResponsiveContainer,
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
}

const LINE_COLORS = [
	"var(--color-info)",
	"var(--color-warning)",
	"var(--color-error)",
];

export function Chart({
	data,
	lines,
	xAxisKey = "x",
	valueSuffix,
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

	if (data.length === 0) {
		return <div className={styles.container} />;
	}

	return (
		<div className={styles.container}>
			<ResponsiveContainer>
				<LineChart data={data}>
					<XAxis dataKey={xAxisKey} tickFormatter={formatXAxis} />
					<YAxis />
					<Tooltip
						content={<ChartTooltip lines={lines} valueSuffix={valueSuffix} />}
					/>
					{lines.map((line, index) => (
						<Line
							key={line.dataKey}
							type="monotone"
							dataKey={line.dataKey}
							stroke={LINE_COLORS[index % LINE_COLORS.length]}
							strokeWidth={2}
							dot={false}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

function ChartTooltip({
	active,
	payload,
	label,
	lines,
	valueSuffix = "",
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

		return label;
	};

	return (
		<div className={styles.tooltip}>
			<h3 className="text-center text-md">{formatHeader()}</h3>
			{payload.map((entry, index) => {
				const color = entry.stroke ?? LINE_COLORS[index % LINE_COLORS.length];
				const line = lines.find((l) => l.dataKey === entry.dataKey);

				return (
					<div key={entry.dataKey} className="stack horizontal items-center sm">
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
