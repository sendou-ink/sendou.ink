import clsx from "clsx";
import * as React from "react";
import { abilities } from "~/modules/in-game-lists";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { abilityImageUrl } from "~/utils/urls";
import { Ability } from "./Ability";
import { Image } from "./Image";

interface AbilitiesSelectorProps {
	selectedAbilities: BuildAbilitiesTupleWithUnknown;
	onChange: (newAbilities: BuildAbilitiesTupleWithUnknown) => void;
}

export function AbilitiesSelector({
	selectedAbilities,
	onChange,
}: AbilitiesSelectorProps) {
	const [, startTransition] = React.useTransition();

	const onSlotClick = ({
		rowI,
		abilityI,
	}: {
		rowI: number;
		abilityI: number;
	}) => {
		const abilitiesClone = JSON.parse(
			JSON.stringify(selectedAbilities),
		) as BuildAbilitiesTupleWithUnknown;

		const row = abilitiesClone[rowI];
		invariant(row);
		invariant(row.length === 4);

		// no need to trigger a rerender
		if (row[abilityI] === "UNKNOWN") return;

		row[abilityI] = "UNKNOWN";

		onChange(abilitiesClone);
	};
	const onButtonClick = (ability: (typeof abilities)[number]) => {
		startTransition(() => {
			onChange(addAbility({ oldAbilities: selectedAbilities, ability }));
		});
	};

	const [draggingAbility, setDraggingAbility] = React.useState<
		(typeof abilities)[number] | undefined
	>();

	const onDragStart =
		(ability: (typeof abilities)[number]) => (event: React.DragEvent) => {
			setDraggingAbility(ability);
			event.dataTransfer.setData("text/plain", JSON.stringify(ability));
		};

	const onDragEnd = () => {
		setDraggingAbility(undefined);
	};

	const onDrop =
		(atRowIndex: number, atAbilityIndex: number) =>
		(event: React.DragEvent) => {
			event.preventDefault();
			const ability = JSON.parse(
				event.dataTransfer.getData("text/plain"),
			) as (typeof abilities)[number];

			onChange(
				addAbility({
					oldAbilities: selectedAbilities,
					ability,
					atRowIndex,
					atAbilityIndex,
				}),
			);
		};

	return (
		<div className="ability-selector__container" data-testid="ability-selector">
			<div className="ability-selector__slots">
				{selectedAbilities.map((row, rowI) =>
					row.map((ability, abilityI) => (
						<Ability
							key={abilityI}
							ability={ability}
							size={abilityI === 0 ? "MAIN" : "SUB"}
							onClick={() => onSlotClick({ rowI, abilityI })}
							dragStarted={!!draggingAbility}
							dropAllowed={canPlaceAbilityAtSlot(
								rowI,
								abilityI,
								draggingAbility,
							)}
							onDrop={onDrop(rowI, abilityI)}
						/>
					)),
				)}
			</div>
			<div className="ability-selector__ability-buttons">
				{abilities.map((ability) => (
					<button
						key={ability.name}
						className={clsx("ability-selector__ability-button", {
							"is-dragging": ability.name === draggingAbility?.name,
						})}
						type="button"
						onClick={() => onButtonClick(ability)}
						data-testid={`${ability.name}-ability-button`}
						draggable="true"
						onDragStart={onDragStart(ability)}
						onDragEnd={onDragEnd}
					>
						<Image
							alt=""
							path={abilityImageUrl(ability.name)}
							width={32}
							height={32}
						/>
					</button>
				))}
			</div>
		</div>
	);
}

const canPlaceAbilityAtSlot = (
	rowIndex: number,
	abilityIndex: number,
	ability?: (typeof abilities)[number],
) => {
	if (!ability) {
		return false;
	}

	const legalGearTypeForMain =
		rowIndex === 0
			? "HEAD_MAIN_ONLY"
			: rowIndex === 1
				? "CLOTHES_MAIN_ONLY"
				: "SHOES_MAIN_ONLY";

	const isMainSlot = abilityIndex === 0;

	if (
		!["STACKABLE", legalGearTypeForMain].includes(ability.type) &&
		isMainSlot
	) {
		// Can't put this type of gear in main slot
		return false;
	}

	if (!isMainSlot && ability.type !== "STACKABLE") {
		// Can't put main slot only gear to sub slots
		return false;
	}
	return true;
};

function addAbility({
	oldAbilities,
	ability,
	atRowIndex,
	atAbilityIndex,
}: {
	oldAbilities: BuildAbilitiesTupleWithUnknown;
	ability: (typeof abilities)[number];
	atRowIndex?: number;
	atAbilityIndex?: number;
}): BuildAbilitiesTupleWithUnknown {
	const abilitiesClone = JSON.parse(
		JSON.stringify(oldAbilities),
	) as BuildAbilitiesTupleWithUnknown;

	if (atRowIndex !== undefined && atAbilityIndex !== undefined) {
		// Attempt to place the ability at a specific slot since we
		// were given an atRowIndex and atAbilityIndex
		if (canPlaceAbilityAtSlot(atRowIndex, atAbilityIndex, ability)) {
			// Assign this ability to the slot
			abilitiesClone[atRowIndex][atAbilityIndex] = ability.name;
		}
	} else {
		// Loop through all slots and attempt to place this ability
		// in the first empty one
		for (const [rowIndex, row] of abilitiesClone.entries()) {
			for (const [abilityIndex, oldAbility] of row.entries()) {
				if (oldAbility !== "UNKNOWN") {
					// Skip any filled slots in this loop until we arrive at an empty one.
					continue;
				}

				if (!canPlaceAbilityAtSlot(rowIndex, abilityIndex, ability)) {
					// This ability isn't valid for this slot
					continue;
				}

				// Assign this ability to the slot
				abilitiesClone[rowIndex][abilityIndex] = ability.name;

				return abilitiesClone;
			}
		}
	}

	// no-op if no available slots
	return abilitiesClone;
}
