import { roundToNDecimalPlaces } from "~/utils/number";

/**
 * An SP change, rendered as a colored arrow followed by the size of the change.
 * A change of exactly zero gets no arrow. Meant to be placed in a flex or grid
 * container that spaces the two apart.
 */
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
