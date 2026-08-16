/**
 * Gear-ability grid (3 rows: head/clothes/shoes, each [main, sub, sub, sub])
 * shared by the death card and the scoreboard player popover.
 */

import type { AbilityWithUnknown } from "@sendou/in-game-lists/types";
import { Button } from "react-aria-components";
import { Ability } from "~/components/Ability";
import { SendouPopover } from "~/components/elements/Popover";
import styles from "./AbilityGrid.module.css";
import eventCardStyles from "./EventCard.module.css";

const ROW_LABELS = ["head", "clothes", "shoes"] as const;

export function AbilityGrid({
	abilities,
}: {
	abilities: AbilityWithUnknown[][];
}) {
	return (
		<table className={eventCardStyles.players}>
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
 * the head-main ability icon.
 */
export function AbilityPopover({
	abilities,
}: {
	abilities: AbilityWithUnknown[][];
}) {
	const trigger = abilities[0]?.[0];
	if (!trigger) return null;
	return (
		<SendouPopover
			trigger={
				<Button
					className={styles.abilityTrigger}
					aria-label="Show abilities (from death events)"
				>
					<Ability ability={trigger} size="TINY" />
				</Button>
			}
		>
			<AbilityGrid abilities={abilities} />
		</SendouPopover>
	);
}
