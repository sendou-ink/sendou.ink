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
import type { MetaFunction } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { PlusIcon } from "~/components/icons/Plus";
import { RefreshIcon } from "~/components/icons/Refresh";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useIsMounted } from "~/hooks/useIsMounted";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, TIER_LIST_MAKER_URL } from "~/utils/urls";
import { ItemDragPreview } from "../components/ItemDragPreview";
import { ItemPool } from "../components/ItemPool";
import { TierRow } from "../components/TierRow";
import {
	TierListProvider,
	useTierListState,
} from "../contexts/TierListContext";
import type { TierListItem } from "../tier-list-maker-schemas";
import styles from "./tier-list-maker.module.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Tier List Maker",
		ogTitle: "Splatoon 3 tier list maker",
		description:
			"Generate Splatoon tier lists featuring main weapons, sub weapons, special weapons or stages.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "tier-list-maker",
	breadcrumb: () => ({
		imgPath: navIconUrl("tier-list-maker"),
		href: TIER_LIST_MAKER_URL,
		type: "IMAGE",
	}),
};

// xxx: button to generate/ share an image
// xxx: switch to toggle off round labels
// xxx: switch to allow having a weapon many times
// xxx: test in mobile
// xxx: zod v4 imports -> need to upgrade to RR7 if we want encode/decode
// xxx: only jsoncrush on drop?

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
		handleReset,
		hideAltKits,
		setHideAltKits,
		hideAltSkins,
		setHideAltSkins,
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
				<ResetPopover key={state.tierItems.size} handleReset={handleReset} />
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
					onSelectionChange={(key) => setItemType(key as TierListItem["type"])}
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
						<SendouTab id="mode">{t("tier-list-maker:modes")}</SendouTab>
						<SendouTab id="stage-mode">
							{t("tier-list-maker:stageModes")}
						</SendouTab>
					</SendouTabList>

					<SendouTabPanel id="main-weapon">
						<div className="stack md">
							<ItemPool />
							<div className={styles.filters}>
								<SendouSwitch
									isSelected={hideAltKits}
									onChange={setHideAltKits}
								>
									{t("tier-list-maker:hideAltKits")}
								</SendouSwitch>
								<SendouSwitch
									isSelected={hideAltSkins}
									onChange={setHideAltSkins}
								>
									{t("tier-list-maker:hideAltSkins")}
								</SendouSwitch>
							</div>
						</div>
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

					<SendouTabPanel id="mode">
						<ItemPool />
					</SendouTabPanel>

					<SendouTabPanel id="stage-mode">
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

function ResetPopover({ handleReset }: { handleReset: () => void }) {
	const { t } = useTranslation(["tier-list-maker", "common"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton
					size="small"
					icon={<RefreshIcon />}
					variant="minimal-destructive"
				>
					{t("common:actions.reset")}
				</SendouButton>
			}
		>
			<div className="stack sm items-center">
				<div>{t("tier-list-maker:resetConfirmation")}</div>
				<div className="stack horizontal sm">
					<SendouButton
						size="miniscule"
						variant="destructive"
						onPress={() => {
							handleReset();
						}}
					>
						{t("common:actions.reset")}
					</SendouButton>
				</div>
			</div>
		</SendouPopover>
	);
}
