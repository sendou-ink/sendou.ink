import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import JSONCrush from "jsoncrush";
import * as React from "react";
import { useSearchParams } from "react-router";
import { z } from "zod";
import {
	useSearchParamState,
	useSearchParamStateEncoder,
} from "~/hooks/useSearchParamState";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import { modeShort, safeJSONParse } from "~/utils/zod";
import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import {
	type TierListItem,
	type TierListMakerTier,
	type TierListState,
	tierListItemTypeSchema,
	tierListStateSerializedSchema,
} from "../tier-list-maker-schemas";
import {
	getNextNthForItem,
	parseItemFromId,
	tierListItemId,
} from "../tier-list-maker-utils";

export function useTierList() {
	const [itemType, setItemType] = useSearchParamState<TierListItem["type"]>({
		name: "type",
		defaultValue: "main-weapon",
		revive: (value) => {
			const parsed = tierListItemTypeSchema.safeParse(value);
			return parsed.success ? parsed.data : "main-weapon";
		},
	});

	const { tiers, setTiers, persistTiersStateToParams, removeItem, moveItem } =
		useSearchParamTiersState();
	const [activeItem, setActiveItem] = React.useState<TierListItem | null>(null);

	const [hideAltKits, setHideAltKits] = useSearchParamState({
		name: "hideAltKits",
		defaultValue: false,
		revive: (value) => value === "true",
	});

	const [hideAltSkins, setHideAltSkins] = useSearchParamState({
		name: "hideAltSkins",
		defaultValue: false,
		revive: (value) => value === "true",
	});

	const [canAddDuplicates, setCanAddDuplicates] = useSearchParamState({
		name: "canAddDuplicates",
		defaultValue: true,
		revive: (value) => value === "true",
	});

	const [showTierHeaders, setShowTierHeaders] = useSearchParamState({
		name: "showTierHeaders",
		defaultValue: true,
		revive: (value) => value === "true",
	});

	const [title, setTitle] = useSearchParamState({
		name: "title",
		defaultValue: "",
		revive: (value) => value,
	});

	const [selectedModes, setSelectedModes] = useSearchParamStateEncoder({
		name: "modes",
		defaultValue: rankedModesShort,
		revive: (value) =>
			z
				.preprocess(safeJSONParse, z.array(modeShort))
				.catch(() => rankedModesShort)
				.parse(value),
		encode: JSON.stringify,
	});

	const handleDragStart = (event: DragStartEvent) => {
		const item = parseItemFromId(String(event.active.id));
		if (item) {
			setActiveItem(item);
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveItem(null);

		if (!event.over) return;

		const itemId = String(event.active.id);
		const item = parseItemFromId(itemId);
		invariant(item);

		const wasRemoved = event.collisions?.some((c) => c.id === "item-pool");

		if (wasRemoved) {
			removeItem(item);
			return;
		}

		// xxx: extract some of these to constants
		const newTier = event.collisions?.find((c) =>
			(c.id as string).startsWith("tier-"),
		)?.id;

		const overItem = event.collisions?.find(
			(c) => !(c.id as string).startsWith("tier-") && c.id !== "item-pool",
		)?.id;

		moveItem({
			movedItemId: itemId,
			overItemId: overItem ? String(overItem) : undefined,
			tierId: newTier ? String(newTier) : undefined,
		});
	};

	const handleAddTier = () => {
		const newTier: TierListMakerTier = {
			id: `tier-${Date.now()}`,
			name: "New",
			color: "#888888",
		};

		const newState = {
			...tiers,
			tiers: [...tiers.tiers, newTier],
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleRemoveTier = (tierId: string) => {
		const newTierItems = new Map(tiers.tierItems);
		newTierItems.delete(tierId);

		const newState = {
			tiers: tiers.tiers.filter((tier) => tier.id !== tierId),
			tierItems: newTierItems,
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleRenameTier = (tierId: string, newName: string) => {
		const newState = {
			...tiers,
			tiers: tiers.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, name: newName } : tier,
			),
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleChangeTierColor = (tierId: string, newColor: string) => {
		const newState = {
			...tiers,
			tiers: tiers.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, color: newColor } : tier,
			),
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const getItemsInTier = (tierId: string): TierListItem[] => {
		return tiers.tierItems.get(tierId) || [];
	};

	const getAllItemIdsForType = (type: TierListItem["type"]) => {
		switch (type) {
			case "main-weapon":
				return [...mainWeaponIds];
			case "sub-weapon":
				return [...subWeaponIds];
			case "special-weapon":
				return [...specialWeaponIds];
			case "stage":
				return [...stageIds];
			case "mode":
				return [...modesShort];
			case "stage-mode": {
				const combinations: string[] = [];
				for (const stageId of stageIds) {
					for (const mode of modesShort) {
						if (selectedModes.includes(mode)) {
							combinations.push(`${stageId}-${mode}`);
						}
					}
				}
				return combinations;
			}
			default: {
				assertUnreachable(type);
			}
		}
	};

	const getAvailableItems = (): TierListItem[] => {
		const placedItems = new Set<string>();
		for (const items of tiers.tierItems.values()) {
			for (const item of items) {
				placedItems.add(`${item.type}:${item.id}`);
			}
		}

		const allItemIds = getAllItemIdsForType(itemType);
		return allItemIds
			.map(
				(id) =>
					({
						id,
						type: itemType,
					}) as TierListItem,
			)
			.flatMap((item) => {
				if (placedItems.has(`${item.type}:${item.id}`)) {
					if (!canAddDuplicates) return [];

					return {
						...item,
						nth: getNextNthForItem(item, tiers),
					};
				}

				if (item.type === "main-weapon" && typeof item.id === "number") {
					const weaponType = weaponIdToType(item.id);
					if (hideAltKits && weaponType === "ALT_KIT") return [];
					if (hideAltSkins && weaponType === "ALT_SKIN") return [];
				}

				return item;
			});
	};

	const handleMoveTierUp = (tierId: string) => {
		const currentIndex = tiers.tiers.findIndex((tier) => tier.id === tierId);
		if (currentIndex <= 0) return;

		const newTiers = [...tiers.tiers];
		[newTiers[currentIndex - 1], newTiers[currentIndex]] = [
			newTiers[currentIndex],
			newTiers[currentIndex - 1],
		];

		const newState = {
			...tiers,
			tiers: newTiers,
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleMoveTierDown = (tierId: string) => {
		const currentIndex = tiers.tiers.findIndex((tier) => tier.id === tierId);
		if (currentIndex === -1 || currentIndex >= tiers.tiers.length - 1) {
			return;
		}

		const newTiers = [...tiers.tiers];
		[newTiers[currentIndex], newTiers[currentIndex + 1]] = [
			newTiers[currentIndex + 1],
			newTiers[currentIndex],
		];

		const newState = {
			...tiers,
			tiers: newTiers,
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleReset = () => {
		const newState = {
			tiers: DEFAULT_TIERS,
			tierItems: new Map(),
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	return {
		itemType,
		setItemType,
		state: tiers,
		activeItem,
		handleDragStart,
		handleDragEnd,
		handleAddTier,
		handleRemoveTier,
		handleRenameTier,
		handleChangeTierColor,
		handleMoveTierUp,
		handleMoveTierDown,
		handleReset,
		getItemsInTier,
		availableItems: getAvailableItems(),
		hideAltKits,
		setHideAltKits,
		hideAltSkins,
		setHideAltSkins,
		canAddDuplicates,
		setCanAddDuplicates,
		showTierHeaders,
		setShowTierHeaders,
		title,
		setTitle,
		selectedModes,
		setSelectedModes,
	};
}

const TIER_SEARCH_PARAM_NAME = "state";

function useSearchParamTiersState() {
	const [initialSearchParams] = useSearchParams();
	const [tiers, setTiers] = React.useState<TierListState>(() => {
		const param = initialSearchParams.get(TIER_SEARCH_PARAM_NAME);

		try {
			if (param) {
				const uncrushed = JSONCrush.uncrush(param);

				const parsed = tierListStateSerializedSchema.parse(
					JSON.parse(uncrushed),
				);

				return {
					tiers: parsed.tiers,
					tierItems: new Map(parsed.tierItems),
				};
			}
		} catch {} // ignored on purpose

		return {
			tiers: DEFAULT_TIERS,
			tierItems: new Map(),
		};
	});

	const persistTiersStateToParams = (state: TierListState) => {
		const searchParams = new URLSearchParams(window.location.search);

		const serializedState = JSON.stringify({
			tiers: state.tiers,
			tierItems: Array.from(state.tierItems.entries()),
		});

		searchParams.set(TIER_SEARCH_PARAM_NAME, JSONCrush.crush(serializedState));
		window.history.replaceState(
			{},
			"",
			`${window.location.pathname}?${String(searchParams)}`,
		);
	};

	const findContainer = (item: TierListItem): string | null => {
		for (const [tierId, items] of tiers.tierItems.entries()) {
			if (
				items.some(
					(i) => i.id === item.id && i.type === item.type && i.nth === item.nth,
				)
			) {
				return tierId;
			}
		}
		return null;
	};

	const updateStateAndSearchParams = (state: TierListState) => {
		setTiers(state);
		persistTiersStateToParams(state);
	};

	const removeItem = (item: TierListItem) => {
		const newTierItems = new Map(tiers.tierItems);

		const currentContainer = findContainer(item);
		if (!currentContainer) return;

		const containerItems = newTierItems.get(currentContainer) || [];
		newTierItems.set(
			currentContainer,
			containerItems.filter(
				(tierItem) => tierListItemId(tierItem) !== tierListItemId(item),
			),
		);

		updateStateAndSearchParams({
			...tiers,
			tierItems: newTierItems,
		});
	};

	const moveItem = ({
		movedItemId,
		overItemId,
		tierId,
	}: {
		movedItemId: string;
		overItemId?: string;
		tierId?: string;
	}) => {
		if (!tierId) return;
		if (movedItemId === overItemId) return;

		let resultState = {
			...tiers,
			tierItems: new Map(tiers.tierItems),
		};

		const [oldTier, oldTierItems] = Array.from(tiers.tierItems.entries()).find(
			([, b]) => b.some((item) => movedItemId === tierListItemId(item)),
		) ?? [null, null];
		const oldIndex = oldTierItems?.findIndex(
			(item) => movedItemId === tierListItemId(item),
		);

		// did we drop it over some other item?
		if (overItemId) {
			const [newTier, newTierItems] = Array.from(
				tiers.tierItems.entries(),
			).find(([, b]) => b.some((item) => overItemId === tierListItemId(item)))!;
			const newIndex = oldTierItems?.findIndex(
				(item) => overItemId === tierListItemId(item),
			);

			// moving inside a tier
			if (oldTier === newTier) {
				const newOrder = arrayMove(newTierItems, oldIndex!, newIndex!);

				resultState.tierItems.set(newTier, newOrder);

				// moving from tier to tier
			} else {
				resultState = filterOutItemFromEveryTierById(resultState, movedItemId);

				const oldItems = resultState.tierItems.get(newTier) ?? [];
				const withItem = oldItems.toSpliced(
					newIndex ?? oldItems.length,
					0,
					parseItemFromId(movedItemId)!,
				);

				resultState.tierItems.set(newTier, withItem);
			}

			// we moved it to some tier (but not on item)
		} else if (oldTier !== tierId) {
			resultState = filterOutItemFromEveryTierById(resultState, movedItemId);

			const existingTier = resultState.tierItems.get(tierId);

			if (existingTier) {
				existingTier.push(parseItemFromId(movedItemId)!);
			} else {
				resultState.tierItems.set(tierId, [parseItemFromId(movedItemId)!]);
			}
		}

		updateStateAndSearchParams(resultState);
	};

	return {
		tiers,
		setTiers,
		persistTiersStateToParams,
		removeItem,
		moveItem,
	};
}

function filterOutItemFromEveryTierById(
	state: TierListState,
	itemId: string,
): TierListState {
	const result = { ...state };

	for (const [tier, items] of state.tierItems.entries()) {
		result.tierItems.set(
			tier,
			items.filter((item) => tierListItemId(item) !== itemId),
		);
	}

	return result;
}
