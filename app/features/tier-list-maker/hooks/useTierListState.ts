import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useSearchParams } from "@remix-run/react";
import JSONCrush from "jsoncrush";
import * as React from "react";
import { flushSync } from "react-dom";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { assertUnreachable } from "~/utils/types";
import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import {
	type TierListItem,
	type TierListMakerTier,
	type TierListState,
	tierListItemTypeSchema,
	tierListStateSerializedSchema,
} from "../tier-list-maker-schemas";
import { getNextNthForItem } from "../tier-list-maker-utils";

const canAddDuplicates = true;

export function useTierList() {
	const [itemType, setItemType] = useSearchParamState<TierListItem["type"]>({
		name: "type",
		defaultValue: "main-weapon",
		revive: (value) => {
			const parsed = tierListItemTypeSchema.safeParse(value);
			return parsed.success ? parsed.data : "main-weapon";
		},
	});

	const { tiers, setTiers, persistTiersStateToParams } =
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

	const parseItemFromId = (id: string): TierListItem | null => {
		const [type, idStr, nth] = String(id).split(":");
		if (!type || !idStr) return null;

		if (type === "mode" || type === "stage-mode") {
			return {
				type: type as TierListItem["type"],
				id: idStr,
				nth: nth ? Number(nth) : undefined,
			} as TierListItem;
		}

		return {
			type: type as TierListItem["type"],
			id: Number(idStr),
			nth: nth ? Number(nth) : undefined,
		} as TierListItem;
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
				const newTierItems = new Map(tiers.tierItems);
				const containerItems = newTierItems.get(activeContainer) || [];
				const oldIndex = containerItems.findIndex(
					(item) =>
						item.id === activeItem.id &&
						item.type === activeItem.type &&
						item.nth === activeItem.nth,
				);
				const newIndex = overItem
					? containerItems.findIndex(
							(item) =>
								item.id === overItem.id &&
								item.type === overItem.type &&
								item.nth === overItem.nth,
						)
					: -1;

				if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
					newTierItems.set(
						activeContainer,
						arrayMove(containerItems, oldIndex, newIndex),
					);
				}

				setTiers({
					...tiers,
					tierItems: newTierItems,
				});
			}
			return;
		}

		const newTierItems = new Map(tiers.tierItems);
		const activeItems = activeContainer
			? newTierItems.get(activeContainer) || []
			: [];
		const overItems = newTierItems.get(overContainer) || [];

		const overIndex = overItem
			? overItems.findIndex(
					(item) =>
						item.id === overItem.id &&
						item.type === overItem.type &&
						item.nth === overItem.nth,
				)
			: overItems.length;

		if (activeContainer) {
			newTierItems.set(
				activeContainer,
				activeItems.filter(
					(item) =>
						!(
							item.id === activeItem.id &&
							item.type === activeItem.type &&
							item.nth === activeItem.nth
						),
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

		setTiers({
			...tiers,
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
			const newTierItems = new Map(tiers.tierItems);
			const currentContainer = findContainer(item);

			if (currentContainer) {
				const containerItems = newTierItems.get(currentContainer) || [];
				newTierItems.set(
					currentContainer,
					containerItems.filter(
						(i) =>
							!(i.id === item.id && i.type === item.type && i.nth === item.nth),
					),
				);
			}

			flushSync(() => {
				setTiers({
					...tiers,
					tierItems: newTierItems,
				});
			});
		}
		persistTiersStateToParams();
	};

	const handleAddTier = () => {
		const newTier: TierListMakerTier = {
			id: `tier-${Date.now()}`,
			name: "New",
			color: "#888888",
		};

		setTiers({
			...tiers,
			tiers: [...tiers.tiers, newTier],
		});
		persistTiersStateToParams();
	};

	const handleRemoveTier = (tierId: string) => {
		const newTierItems = new Map(tiers.tierItems);
		newTierItems.delete(tierId);

		setTiers({
			tiers: tiers.tiers.filter((tier) => tier.id !== tierId),
			tierItems: newTierItems,
		});
		persistTiersStateToParams();
	};

	const handleRenameTier = (tierId: string, newName: string) => {
		setTiers({
			...tiers,
			tiers: tiers.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, name: newName } : tier,
			),
		});
		persistTiersStateToParams();
	};

	const handleChangeTierColor = (tierId: string, newColor: string) => {
		setTiers({
			...tiers,
			tiers: tiers.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, color: newColor } : tier,
			),
		});
		persistTiersStateToParams();
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
		for (const items of tiers.tierItems.values()) {
			for (const item of items) {
				placedItems.add(`${item.type}:${item.id}`);
			}
		}

		const allItemIds = getAllItemIdsForType(itemType);
		return allItemIds
			.map((id) => ({ id, type: itemType }) as TierListItem)
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

		setTiers({
			...tiers,
			tiers: newTiers,
		});
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

		setTiers({
			...tiers,
			tiers: newTiers,
		});
	};

	const handleReset = () => {
		setTiers({
			tiers: DEFAULT_TIERS,
			tierItems: new Map(),
		});
	};

	return {
		itemType,
		setItemType,
		state: tiers,
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

const TIER_SEARCH_PARAM_NAME = "state";

export function useSearchParamTiersState() {
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

	const persistTiersStateToParams = () => {
		const searchParams = new URLSearchParams(window.location.search);

		const serializedState = JSON.stringify({
			tiers: tiers.tiers,
			tierItems: Array.from(tiers.tierItems.entries()),
		});

		searchParams.set(TIER_SEARCH_PARAM_NAME, JSONCrush.crush(serializedState));
		window.history.replaceState(
			{},
			"",
			`${window.location.pathname}?${String(searchParams)}`,
		);
	};

	return {
		tiers,
		setTiers,
		persistTiersStateToParams,
	};
}
