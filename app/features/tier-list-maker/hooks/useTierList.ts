import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import * as React from "react";
import * as v from "valibot";
import { abilitiesShort } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { useSearchParam } from "~/modules/search-params/hooks";
import { assertUnreachable } from "~/utils/types";
import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import type {
	TierListItem,
	TierListMakerTier,
	TierListState,
} from "../tier-list-maker-schemas";
import { tierListMakerSearchParams } from "../tier-list-maker-search-params";
import {
	addItemToTier,
	getNextNthForItem,
	tierIdFromSortableId,
} from "../tier-list-maker-utils";

export type TierListPlacementMode = "track" | "click";

const placementModePersisted = PersistedState.define({
	key: "tier-list-maker__placement-mode",
	storage: "local",
	schema: v.picklist(["track", "click"]),
	default: "track" as TierListPlacementMode,
});

export function useTierList() {
	const [itemType, setItemType] = useSearchParam(
		tierListMakerSearchParams,
		"type",
	);

	const { tiers, setTiers, persistTiersStateToParams } =
		useSearchParamTiersState();
	const [activeItem, setActiveItem] = React.useState<TierListItem | null>(null);
	const [isReorderingTiers, setIsReorderingTiers] = React.useState(false);

	const [placementMode, setPlacementMode] = usePersistedState(
		placementModePersisted,
	);
	const [selectedTierId, setSelectedTierId] = React.useState<string | null>(
		() => (placementMode === "click" ? (tiers.tiers[0]?.id ?? null) : null),
	);

	const handleChangePlacementMode = (mode: TierListPlacementMode) => {
		setPlacementMode(mode);
		setSelectedTierId(mode === "click" ? (tiers.tiers[0]?.id ?? null) : null);
	};

	const [hideAltKits, setHideAltKits] = useSearchParam(
		tierListMakerSearchParams,
		"hideAltKits",
	);

	const [hideAltSkins, setHideAltSkins] = useSearchParam(
		tierListMakerSearchParams,
		"hideAltSkins",
	);

	const [canAddDuplicates, setCanAddDuplicates] = useSearchParam(
		tierListMakerSearchParams,
		"canAddDuplicates",
	);

	const [showTierHeaders, setShowTierHeaders] = useSearchParam(
		tierListMakerSearchParams,
		"showTierHeaders",
	);

	const [title, setTitle] = useSearchParam(tierListMakerSearchParams, "title");

	const [selectedModes, setSelectedModes] = useSearchParam(
		tierListMakerSearchParams,
		"modes",
	);

	const parseItemFromId = (id: string): TierListItem | null => {
		const [type, idStr, nth] = String(id).split(":");
		if (!type || !idStr) return null;

		if (type === "mode" || type === "stage-mode" || type === "ability") {
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
		const isTierDrag = tierIdFromSortableId(String(event.active.id)) !== null;
		setIsReorderingTiers(isTierDrag);
		if (isTierDrag) return;

		const item = parseItemFromId(String(event.active.id));
		if (item) {
			setActiveItem(item);
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;

		if (!over || tierIdFromSortableId(String(active.id))) {
			return;
		}

		const draggedItem = parseItemFromId(String(active.id));
		if (!draggedItem) return;

		const overId = over.id;

		const activeContainer = findContainer(draggedItem);
		const overItem = parseItemFromId(String(overId));
		const overContainer = String(overId).startsWith("tier-")
			? String(overId)
			: overItem
				? findContainer(overItem)
				: null;

		// same-container reordering is in handleDragEnd; here it would ping-pong render → dragOver
		if (!overContainer || activeContainer === overContainer) {
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
							item.id === draggedItem.id &&
							item.type === draggedItem.type &&
							item.nth === draggedItem.nth
						),
				),
			);
		}

		const newOverItems = [...overItems];
		newOverItems.splice(
			overIndex === -1 ? newOverItems.length : overIndex,
			0,
			draggedItem,
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
		setIsReorderingTiers(false);

		const draggedTierId = tierIdFromSortableId(String(active.id));
		if (draggedTierId) {
			handleReorderTiers(draggedTierId, over?.id);
			return;
		}

		if (!over) {
			persistTiersStateToParams(tiers);
			return;
		}

		const item = parseItemFromId(String(active.id));
		if (!item) {
			persistTiersStateToParams(tiers);
			return;
		}

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

			const newState = {
				...tiers,
				tierItems: newTierItems,
			};
			setTiers(newState);
			persistTiersStateToParams(newState);
			return;
		}

		const activeContainer = findContainer(item);
		if (!activeContainer) {
			persistTiersStateToParams(tiers);
			return;
		}

		const containerItems = tiers.tierItems.get(activeContainer) || [];
		const oldIndex = containerItems.findIndex(
			(i) => i.id === item.id && i.type === item.type && i.nth === item.nth,
		);
		const newIndex = overItem
			? containerItems.findIndex(
					(i) =>
						i.id === overItem.id &&
						i.type === overItem.type &&
						i.nth === overItem.nth,
				)
			: -1;

		if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
			const newTierItems = new Map(tiers.tierItems);
			newTierItems.set(
				activeContainer,
				arrayMove(containerItems, oldIndex, newIndex),
			);
			const newState = {
				...tiers,
				tierItems: newTierItems,
			};
			setTiers(newState);
			persistTiersStateToParams(newState);
			return;
		}

		persistTiersStateToParams(tiers);
	};

	const handleDragCancel = () => {
		setActiveItem(null);
		setIsReorderingTiers(false);
	};

	const handleReorderTiers = (
		draggedTierId: string,
		overId: string | number | undefined,
	) => {
		const overTierId = overId ? tierIdFromSortableId(String(overId)) : null;
		if (!overTierId || overTierId === draggedTierId) return;

		const oldIndex = tiers.tiers.findIndex((tier) => tier.id === draggedTierId);
		const newIndex = tiers.tiers.findIndex((tier) => tier.id === overTierId);
		if (oldIndex === -1 || newIndex === -1) return;

		const newState = {
			...tiers,
			tiers: arrayMove(tiers.tiers, oldIndex, newIndex),
		};
		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleAddItemToTier = (item: TierListItem, tierId: string) => {
		const newState = addItemToTier(tiers, tierId, item);
		if (newState === tiers) return;

		setTiers(newState);
		persistTiersStateToParams(newState);
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
		if (selectedTierId === tierId) {
			setSelectedTierId(null);
		}

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
			case "ability":
				return [...abilitiesShort];
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
		isReorderingTiers,
		handleDragStart,
		handleDragOver,
		handleDragEnd,
		handleDragCancel,
		handleAddTier,
		handleAddItemToTier,
		handleRemoveTier,
		handleRenameTier,
		handleChangeTierColor,
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
		placementMode,
		setPlacementMode: handleChangePlacementMode,
		selectedTierId,
		setSelectedTierId,
	};
}

/** `setTiers` only touches React state (drag-over fires per pointer move); `persistTiersStateToParams` writes the URL. */
function useSearchParamTiersState() {
	const [stateParam, setStateParam] = useSearchParam(
		tierListMakerSearchParams,
		"state",
	);
	const [tiers, setTiers] = React.useState<TierListState>(() => stateParam);

	return {
		tiers,
		setTiers,
		persistTiersStateToParams: setStateParam,
	};
}
