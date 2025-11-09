import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { PlusIcon } from "~/components/icons/Plus";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useIsMounted } from "~/hooks/useIsMounted";
import { ItemDragPreview } from "../components/ItemDragPreview";
import { ItemPool } from "../components/ItemPool";
import { TierRow } from "../components/TierRow";
import {
	TierListProvider,
	useTierListState,
} from "../contexts/TierListContext";
import type { TierListItemType } from "../tier-list-maker-types";
import styles from "./tier-list-maker.module.css";

// xxx: button to generate/ share an image
// xxx: switch to toggle off round labels
// xxx: switch to allow having a weapon many times
// xxx: stage+modes
// xxx: persist to search params
// xxx: add to navigation
// xxx: popover jank
// xxx: popover input too big?
// xxx: to remove images, need to drag precisely between the wpn images
// xxx: test in mobile
// xxx: toggle under main weapons to not show alt skins?

export default function TierListMakerPage() {
	const isMounted = useIsMounted();

	if (!isMounted)
		return (
			<Main bigger>
				<Placeholder />
			</Main>
		);

	return (
		<TierListProvider>
			<TierListMakerContent />
		</TierListProvider>
	);
}

function TierListMakerContent() {
	const { t } = useTranslation(["tier-list-maker"]);
	const {
		itemType,
		setItemType,
		state,
		activeItem,
		handleDragStart,
		handleDragOver,
		handleDragEnd,
		handleAddTier,
	} = useTierListState();

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	return (
		<Main bigger className="stack lg">
			<div className={styles.header}>
				<SendouButton onPress={handleAddTier} size="small" icon={<PlusIcon />}>
					{t("tier-list-maker:addTier")}
				</SendouButton>
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={pointerWithin}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<div className={styles.tierList}>
					{state.tiers.map((tier) => (
						<TierRow key={tier.id} tier={tier} />
					))}
				</div>

				<SendouTabs
					selectedKey={itemType}
					onSelectionChange={(key) => setItemType(key as TierListItemType)}
				>
					<SendouTabList>
						<SendouTab id="main-weapon">
							{t("tier-list-maker:mainWeapons")}
						</SendouTab>
						<SendouTab id="sub-weapon">
							{t("tier-list-maker:subWeapons")}
						</SendouTab>
						<SendouTab id="special-weapon">
							{t("tier-list-maker:specialWeapons")}
						</SendouTab>
						<SendouTab id="stage">{t("tier-list-maker:stages")}</SendouTab>
					</SendouTabList>

					<SendouTabPanel id="main-weapon">
						<ItemPool />
					</SendouTabPanel>

					<SendouTabPanel id="sub-weapon">
						<ItemPool />
					</SendouTabPanel>

					<SendouTabPanel id="special-weapon">
						<ItemPool />
					</SendouTabPanel>

					<SendouTabPanel id="stage">
						<ItemPool />
					</SendouTabPanel>
				</SendouTabs>

				<DragOverlay>
					{activeItem ? <ItemDragPreview item={activeItem} /> : null}
				</DragOverlay>
			</DndContext>
		</Main>
	);
}
