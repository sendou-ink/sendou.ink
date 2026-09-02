/** Gear-ability grid (head/clothes/shoes rows of [main, sub, sub, sub]) shared by death card and player popover. */

import { Button } from "react-aria-components";
import { Ability } from "~/components/Ability";
import { SendouPopover } from "~/components/elements/Popover";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import styles from "./AbilityGrid.module.css";
import { EventCardPlayerTable } from "./EventCardShell";

const ROW_LABELS = ["head", "clothes", "shoes"] as const;

export function AbilityGrid({
	abilities,
}: {
	abilities: AbilityWithUnknown[][];
}) {
	return (
		<EventCardPlayerTable>
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
		</EventCardPlayerTable>
	);
}

/** Click-to-toggle popover showing a player's ability grid; the head-main icon is the trigger. */
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
