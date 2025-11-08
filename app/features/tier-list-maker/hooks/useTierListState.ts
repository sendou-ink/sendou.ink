import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import {
	DEFAULT_TIERS,
	type Tier,
	type TierListItem,
	type TierListItemType,
	type TierListState,
} from "../tier-list-maker-types";

export function useTierListState() {
	const [itemType, setItemType] = useState<TierListItemType>("main-weapon");
	const [state, setState] = useState<TierListState>({
		tiers: DEFAULT_TIERS,
		tierItems: new Map(),
	});
	const [activeItem, setActiveItem] = useState<TierListItem | null>(null);

	const parseItemFromId = (id: string): TierListItem | null => {
		const [type, idStr] = String(id).split(":");
		if (!type || !idStr) return null;
		return {
			type: type as TierListItemType,
			id: Number(idStr) as number & {},
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
				setState((prev) => {
					const newTierItems = new Map(prev.tierItems);
					const containerItems = newTierItems.get(activeContainer) || [];
					const oldIndex = containerItems.findIndex(
						(item) =>
							item.id === activeItem.id && item.type === activeItem.type,
					);
					const newIndex = overItem
						? containerItems.findIndex(
								(item) =>
									item.id === overItem.id && item.type === overItem.type,
							)
						: -1;

					if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
						newTierItems.set(
							activeContainer,
							arrayMove(containerItems, oldIndex, newIndex),
						);
					}

					return {
						...prev,
						tierItems: newTierItems,
					};
				});
			}
			return;
		}

		setState((prev) => {
			const newTierItems = new Map(prev.tierItems);
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

			return {
				...prev,
				tierItems: newTierItems,
			};
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

		if (overId === "item-pool") {
			setState((prev) => {
				const newTierItems = new Map(prev.tierItems);
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

				return {
					...prev,
					tierItems: newTierItems,
				};
			});
		}
	};

	const handleAddTier = () => {
		const newTier: Tier = {
			id: `tier-${Date.now()}`,
			name: "New Tier",
			color: "#888888",
		};

		setState((prev) => ({
			...prev,
			tiers: [...prev.tiers, newTier],
		}));
	};

	const handleRemoveTier = (tierId: string) => {
		setState((prev) => {
			const newTierItems = new Map(prev.tierItems);
			newTierItems.delete(tierId);

			return {
				tiers: prev.tiers.filter((tier) => tier.id !== tierId),
				tierItems: newTierItems,
			};
		});
	};

	const handleRenameTier = (tierId: string, newName: string) => {
		setState((prev) => ({
			...prev,
			tiers: prev.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, name: newName } : tier,
			),
		}));
	};

	const handleChangeTierColor = (tierId: string, newColor: string) => {
		setState((prev) => ({
			...prev,
			tiers: prev.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, color: newColor } : tier,
			),
		}));
	};

	const getItemsInTier = (tierId: string): TierListItem[] => {
		return state.tierItems.get(tierId) || [];
	};

	const getAllItemIdsForType = (type: TierListItemType): number[] => {
		switch (type) {
			case "main-weapon":
				return [...mainWeaponIds];
			case "sub-weapon":
				return [...subWeaponIds];
			case "special-weapon":
				return [...specialWeaponIds];
			case "stage":
				return [...stageIds];
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
			.filter((item) => !placedItems.has(`${item.type}:${item.id}`));
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
		getItemsInTier,
		availableItems: getAvailableItems(),
	};
}
