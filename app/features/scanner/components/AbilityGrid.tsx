/**
 * Gear-ability grid (3 rows: head/clothes/shoes, each [main, sub, sub, sub])
 * shared by the death card and the scoreboard player popover.
 */

import { useState } from "react";
import { Ability } from "~/components/Ability";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";

const ROW_LABELS = ["head", "clothes", "shoes"] as const;

export function AbilityGrid({
	abilities,
}: {
	abilities: AbilityWithUnknown[][];
}) {
	return (
		<table className="players">
			<tbody>
				{abilities.map((row, i) => (
					<tr key={i}>
						<td>{ROW_LABELS[i]}</td>
						{row.map((id, j) => (
							<td key={j}>
								<Ability ability={id} size={j === 0 ? "SUBTINY" : "TINY"} />
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

/**
 * Click-to-toggle popover showing a player's ability grid; the trigger is
 * the head-main ability icon. Closes when the pointer leaves it.
 */
export function AbilityPopover({
	abilities,
}: {
	abilities: AbilityWithUnknown[][];
}) {
	const [open, setOpen] = useState(false);
	const trigger = abilities[0]?.[0];
	if (!trigger) return null;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover-dismiss only; the button inside is the interactive element
		<span className="ability-popover" onMouseLeave={() => setOpen(false)}>
			<button
				type="button"
				className="ability-trigger"
				onClick={() => setOpen((o) => !o)}
				title="Show abilities (from death events)"
			>
				<Ability ability={trigger} size="TINY" />
			</button>
			{open && (
				<div className="popover">
					<AbilityGrid abilities={abilities} />
				</div>
			)}
		</span>
	);
}
