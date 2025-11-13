import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";
import { z } from "zod/v4";
import { useSearchParamStateZod } from "~/hooks/useSearchParamState";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { assertUnreachable } from "~/utils/types";
import { jsonCrushCodec } from "~/utils/zod";
import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import {
	type TierListItem,
	type TierListMakerTier,
	tierListItemTypeSchema,
	tierListStateSchema,
} from "../tier-list-maker-schemas";

export function useTierListState() {
	const [itemType, setItemType] = useSearchParamStateZod({
		key: "type",
		defaultValue: "main-weapon",
		schema: tierListItemTypeSchema,
	});

	const [state, setState] = useSearchParamStateZod({
		key: "state",
		defaultValue: {
			tiers: DEFAULT_TIERS,
			tierItems: new Map(),
		},
		schema: jsonCrushCodec(tierListStateSchema),
	});
	const [activeItem, setActiveItem] = useState<TierListItem | null>(null);

	const [hideAltKits, setHideAltKits] = useSearchParamStateZod({
		key: "hideAltKits",
		defaultValue: false,
		schema: z.boolean(),
	});

	const [hideAltSkins, setHideAltSkins] = useSearchParamStateZod({
		key: "hideAltSkins",
		defaultValue: false,
		schema: z.boolean(),
	});

	const parseItemFromId = (id: string): TierListItem | null => {
		const [type, idStr] = String(id).split(":");
		if (!type || !idStr) return null;

		if (type === "mode" || type === "stage-mode") {
			return {
				type: type as TierListItem["type"],
				id: idStr,
			} as TierListItem;
		}

		return {
			type: type as TierListItem["type"],
			id: Number(idStr),
		} as TierListItem;
	};

	const findContainer = (item: TierListItem): string | null => {
		for (const [tierId, items] of state.tierItems.entries()) {
			if (items.some((i) => i.id === item.id && i.type === item.type)) {
				return tierId;
			}
		}
		return null;
	};

	const handleDragStart = (event: DragStartEvent) => {
		const item = parseItemFromId(String(event.active.id));
		if (item) {
			setActiveItem(item);
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;

		if (!over) {
			return;
		}

		const activeItem = parseItemFromId(String(active.id));
		if (!activeItem) return;

		const overId = over.id;

		const activeContainer = findContainer(activeItem);
		const overItem = parseItemFromId(String(overId));
		const overContainer = String(overId).startsWith("tier-")
			? String(overId)
			: overItem
				? findContainer(overItem)
				: null;

		if (!overContainer || activeContainer === overContainer) {
			if (activeContainer && overContainer === activeContainer) {
				const newTierItems = new Map(state.tierItems);
				const containerItems = newTierItems.get(activeContainer) || [];
				const oldIndex = containerItems.findIndex(
					(item) => item.id === activeItem.id && item.type === activeItem.type,
				);
				const newIndex = overItem
					? containerItems.findIndex(
							(item) => item.id === overItem.id && item.type === overItem.type,
						)
					: -1;

				if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
					newTierItems.set(
						activeContainer,
						arrayMove(containerItems, oldIndex, newIndex),
					);
				}

				setState({
					...state,
					tierItems: newTierItems,
				});
			}
			return;
		}

		const newTierItems = new Map(state.tierItems);
		const activeItems = activeContainer
			? newTierItems.get(activeContainer) || []
			: [];
		const overItems = newTierItems.get(overContainer) || [];

		const overIndex = overItem
			? overItems.findIndex(
					(item) => item.id === overItem.id && item.type === overItem.type,
				)
			: overItems.length;

		if (activeContainer) {
			newTierItems.set(
				activeContainer,
				activeItems.filter(
					(item) =>
						!(item.id === activeItem.id && item.type === activeItem.type),
				),
			);
		}

		const newOverItems = [...overItems];
		newOverItems.splice(
			overIndex === -1 ? newOverItems.length : overIndex,
			0,
			activeItem,
		);
		newTierItems.set(overContainer, newOverItems);

		setState({
			...state,
			tierItems: newTierItems,
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveItem(null);

		if (!over) {
			return;
		}

		const item = parseItemFromId(String(active.id));
		if (!item) return;

		const overId = over.id;

		const overItem = parseItemFromId(String(overId));
		const isDroppedInPool =
			overId === "item-pool" || (overItem && !findContainer(overItem));

		if (isDroppedInPool) {
			const newTierItems = new Map(state.tierItems);
			const currentContainer = findContainer(item);

			if (currentContainer) {
				const containerItems = newTierItems.get(currentContainer) || [];
				newTierItems.set(
					currentContainer,
					containerItems.filter(
						(i) => !(i.id === item.id && i.type === item.type),
					),
				);
			}

			setState({
				...state,
				tierItems: newTierItems,
			});
		}
	};

	const handleAddTier = () => {
		const newTier: TierListMakerTier = {
			id: `tier-${Date.now()}`,
			name: "New Tier",
			color: "#888888",
		};

		setState({
			...state,
			tiers: [...state.tiers, newTier],
		});
	};

	const handleRemoveTier = (tierId: string) => {
		const newTierItems = new Map(state.tierItems);
		newTierItems.delete(tierId);

		setState({
			tiers: state.tiers.filter((tier) => tier.id !== tierId),
			tierItems: newTierItems,
		});
	};

	const handleRenameTier = (tierId: string, newName: string) => {
		setState({
			...state,
			tiers: state.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, name: newName } : tier,
			),
		});
	};

	const handleChangeTierColor = (tierId: string, newColor: string) => {
		setState({
			...state,
			tiers: state.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, color: newColor } : tier,
			),
		});
	};

	const getItemsInTier = (tierId: string): TierListItem[] => {
		return state.tierItems.get(tierId) || [];
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
						combinations.push(`${stageId}-${mode}`);
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
		for (const items of state.tierItems.values()) {
			for (const item of items) {
				placedItems.add(`${item.type}:${item.id}`);
			}
		}

		const allItemIds = getAllItemIdsForType(itemType);
		return allItemIds
			.map((id) => ({ id, type: itemType }) as TierListItem)
			.filter((item) => {
				if (placedItems.has(`${item.type}:${item.id}`)) return false;

				if (item.type === "main-weapon" && typeof item.id === "number") {
					const weaponType = weaponIdToType(item.id);
					if (hideAltKits && weaponType === "ALT_KIT") return false;
					if (hideAltSkins && weaponType === "ALT_SKIN") return false;
				}

				return true;
			});
	};

	const handleMoveTierUp = (tierId: string) => {
		const currentIndex = state.tiers.findIndex((tier) => tier.id === tierId);
		if (currentIndex <= 0) return;

		const newTiers = [...state.tiers];
		[newTiers[currentIndex - 1], newTiers[currentIndex]] = [
			newTiers[currentIndex],
			newTiers[currentIndex - 1],
		];

		setState({
			...state,
			tiers: newTiers,
		});
	};

	const handleMoveTierDown = (tierId: string) => {
		const currentIndex = state.tiers.findIndex((tier) => tier.id === tierId);
		if (currentIndex === -1 || currentIndex >= state.tiers.length - 1) {
			return;
		}

		const newTiers = [...state.tiers];
		[newTiers[currentIndex], newTiers[currentIndex + 1]] = [
			newTiers[currentIndex + 1],
			newTiers[currentIndex],
		];

		setState({
			...state,
			tiers: newTiers,
		});
	};

	const handleReset = () => {
		setState({
			tiers: DEFAULT_TIERS,
			tierItems: new Map(),
		});
	};

	return {
		itemType,
		setItemType,
		state,
		activeItem,
		handleDragStart,
		handleDragOver,
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
	};
}
