import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import * as React from "react";
import * as v from "valibot";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { useSearchParam } from "~/modules/search-params/hooks";
import * as DragIds from "../core/DragIds";
import * as ItemPool from "../core/ItemPool";
import * as TierList from "../core/TierList";
import type { TierListItem, TierListState } from "../tier-list-maker-schemas";
import { tierListMakerSearchParams } from "../tier-list-maker-search-params";

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

	const updateTiers = (newState: TierListState) => {
		if (newState === tiers) return;

		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleDragStart = (event: DragStartEvent) => {
		const isTierDrag =
			DragIds.tierIdFromSortableId(String(event.active.id)) !== null;
		setIsReorderingTiers(isTierDrag);
		if (isTierDrag) return;

		const item = DragIds.parseItemId(String(event.active.id));
		if (item) {
			setActiveItem(item);
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;

		if (!over || DragIds.tierIdFromSortableId(String(active.id))) {
			return;
		}

		const draggedItem = DragIds.parseItemId(String(active.id));
		if (!draggedItem) return;

		const overId = String(over.id);
		const overItem = DragIds.parseItemId(overId);
		const overTierId = overId.startsWith("tier-")
			? overId
			: overItem
				? TierList.tierOf(tiers, overItem)
				: null;

		// same-tier reordering is in handleDragEnd; here it would ping-pong render → dragOver
		if (!overTierId || TierList.tierOf(tiers, draggedItem) === overTierId) {
			return;
		}

		setTiers(
			TierList.moveItem(tiers, {
				item: draggedItem,
				toTierId: overTierId,
				overItem,
			}),
		);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveItem(null);
		setIsReorderingTiers(false);

		const draggedTierId = DragIds.tierIdFromSortableId(String(active.id));
		if (draggedTierId) {
			const overTierId = over
				? DragIds.tierIdFromSortableId(String(over.id))
				: null;
			if (overTierId) {
				updateTiers(TierList.moveTier(tiers, draggedTierId, overTierId));
			}
			return;
		}

		// drag over only moved the item in React state, the URL is written when the drag ends
		const item = DragIds.parseItemId(String(active.id));
		if (!over || !item) {
			persistTiersStateToParams(tiers);
			return;
		}

		const overItem = DragIds.parseItemId(String(over.id));
		const isDroppedInPool =
			over.id === DragIds.POOL_ID ||
			(overItem && !TierList.tierOf(tiers, overItem));

		const newState = isDroppedInPool
			? TierList.removeItem(tiers, item)
			: overItem
				? TierList.reorderItem(tiers, item, overItem)
				: tiers;

		setTiers(newState);
		persistTiersStateToParams(newState);
	};

	const handleDragCancel = () => {
		setActiveItem(null);
		setIsReorderingTiers(false);
	};

	const handleAddItemToTier = (item: TierListItem, tierId: string) => {
		updateTiers(TierList.addItem(tiers, tierId, item));
	};

	const handleAddTier = () => {
		updateTiers(TierList.addTier(tiers, `tier-${Date.now()}`));
	};

	const handleRemoveTier = (tierId: string) => {
		if (selectedTierId === tierId) {
			setSelectedTierId(null);
		}

		updateTiers(TierList.removeTier(tiers, tierId));
	};

	const handleRenameTier = (tierId: string, name: string) => {
		updateTiers(TierList.updateTier(tiers, tierId, { name }));
	};

	const handleChangeTierColor = (tierId: string, color: string) => {
		updateTiers(TierList.updateTier(tiers, tierId, { color }));
	};

	const getItemsInTier = (tierId: string): TierListItem[] => {
		return tiers.tierItems.get(tierId) || [];
	};

	const handleReset = () => {
		updateTiers(TierList.empty());
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
		availableItems: ItemPool.items({
			state: tiers,
			type: itemType,
			canAddDuplicates,
			hideAltKits,
			hideAltSkins,
			modes: selectedModes,
		}),
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
