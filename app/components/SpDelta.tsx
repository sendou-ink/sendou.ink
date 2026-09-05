import { roundToNDecimalPlaces } from "~/utils/number";

/** SP change as a colored arrow (none for zero) and the size; place in a flex/grid container spacing the two. */
export function SpDelta({ diff }: { diff: number }) {
	const rounded = roundToNDecimalPlaces(diff);

	return (
		<>
			{rounded === 0 ? null : (
				<span className={rounded > 0 ? "text-success" : "text-warning"}>
					{rounded > 0 ? "▲" : "▼"}
				</span>
			)}
			<span>{Math.abs(rounded)}SP</span>
		</>
	);
}
