import { parseISO } from "date-fns";
import { LineChart } from "~/components/LineChart";

/** Area chart of a user's SP over a season with the peak marked. Needs at least two points. */
export function SeasonSpChart({
	points,
	interactive = false,
	className,
}: {
	/** SP at the end of each day played, dates in "yyyy-MM-dd" format */
	points: Array<{ date: string; sp: number }>;
	/** Hovering shows the SP of the day closest to the pointer */
	interactive?: boolean;
	/** Sets the height, 170px by default */
	className?: string;
}) {
	return (
		<LineChart
			series={[
				{
					label: "SP",
					points: points.map((point) => ({
						x: parseISO(point.date).getTime(),
						y: point.sp,
					})),
				},
			]}
			xAxis={{ type: "date" }}
			formatValue={(sp) => `${sp.toFixed(1)}SP`}
			area
			showPeak
			interactive={interactive}
			className={className}
			ariaLabel="SP"
		/>
	);
}
