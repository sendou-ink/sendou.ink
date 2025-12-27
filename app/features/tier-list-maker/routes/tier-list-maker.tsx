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
import { snapdom } from "@zumer/snapdom";
import clsx from "clsx";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { ModeImage } from "~/components/Image";
import { DownloadIcon } from "~/components/icons/Download";
import { PlusIcon } from "~/components/icons/Plus";
import { RefreshIcon } from "~/components/icons/Refresh";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import { modesShort } from "~/modules/in-game-lists/modes";
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
	const user = useUser();

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
		canAddDuplicates,
		setCanAddDuplicates,
		showTierHeaders,
		setShowTierHeaders,
		title,
		setTitle,
		screenshotMode,
		setScreenshotMode,
		selectedModes,
		setSelectedModes,
	} = useTierListState();

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const tierListRef = useRef<HTMLDivElement>(null);

	const handleDownload = async () => {
		if (!tierListRef.current) return;

		flushSync(() => setScreenshotMode(true));

		await snapdom.download(tierListRef.current, {
			type: "png",
			filename: "tier-list",
			quality: 1,
			scale: 1.75,
			embedFonts: true,
			backgroundColor: getComputedStyle(document.body).backgroundColor,
		});

		setScreenshotMode(false);
	};

	return (
		<Main bigger className={clsx(styles.container, "stack lg")}>
			<div className={styles.header}>
				<div className="stack horizontal md">
					<SendouButton
						onPress={handleAddTier}
						size="small"
						icon={<PlusIcon />}
					>
						{t("tier-list-maker:addTier")}
					</SendouButton>
					<SendouButton
						onPress={handleDownload}
						size="small"
						icon={<DownloadIcon />}
					>
						{t("tier-list-maker:download")}
					</SendouButton>
				</div>
				<ResetPopover key={state.tierItems.size} handleReset={handleReset} />
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={pointerWithin}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<div className="stack">
					<div
						className={clsx(styles.tierList, {
							[styles.tierListScreenshotMode]: screenshotMode,
						})}
						ref={tierListRef}
					>
						{title || !screenshotMode ? (
							<input
								type="text"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder={t("tier-list-maker:titlePlaceholder")}
								className={clsx(styles.titleInput, "plain")}
							/>
						) : null}
						{screenshotMode && title && user ? (
							<div className={styles.authorSection}>
								<div className={styles.authorBy}>{t("tier-list-maker:by")}</div>
								<div className={styles.authorInfo}>
									<Avatar user={user} size="xxxs" alt={user.username} />
									<span className={styles.authorUsername}>{user.username}</span>
								</div>
							</div>
						) : null}
						{state.tiers.map((tier) => (
							<TierRow key={tier.id} tier={tier} />
						))}
					</div>

					<div className="stack horizontal md flex-wrap">
						<SendouSwitch
							isSelected={canAddDuplicates}
							onChange={setCanAddDuplicates}
							size="small"
						>
							{t("tier-list-maker:allowDuplicates")}
						</SendouSwitch>
						<SendouSwitch
							isSelected={showTierHeaders}
							onChange={setShowTierHeaders}
							size="small"
						>
							{t("tier-list-maker:showTierHeaders")}
						</SendouSwitch>
					</div>
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
						<div className="stack md">
							<ItemPool />
							<div className={clsx(styles.filters, styles.modeFilters)}>
								{modesShort.map((mode) => {
									const isSelected = selectedModes.includes(mode);
									return (
										<SendouSwitch
											key={mode}
											isSelected={isSelected}
											onChange={(selected) => {
												if (selected) {
													setSelectedModes([...selectedModes, mode]);
												} else {
													setSelectedModes(
														selectedModes.filter((m) => m !== mode),
													);
												}
											}}
										>
											<ModeImage mode={mode} size={32} />
										</SendouSwitch>
									);
								})}
							</div>
						</div>
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
