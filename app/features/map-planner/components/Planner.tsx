import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
	AssetRecordType,
	createShapeId,
	DefaultStylePanel,
	type Editor,
	type TLAssetId,
	type TLComponents,
	type TLImageAsset,
	type TLShapeId,
	type TLUiStylePanelProps,
	Tldraw,
} from "@tldraw/tldraw";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "~/features/theme/core/provider";
import type { LanguageCode } from "~/modules/i18n/config";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	specialWeaponIds,
	subWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import { logger } from "~/utils/logger";
import {
	mainWeaponImageUrl,
	modeImageUrl,
	outlinedMainWeaponImageUrl,
	specialWeaponImageUrl,
	stageMinimapImageUrlWithEnding,
	subWeaponImageUrl,
	weaponCategoryUrl,
} from "~/utils/urls";
import { LinkButton, SendouButton } from "../../../components/elements/Button";
import { Image } from "../../../components/Image";
import type { StageBackgroundStyle } from "../plans-types";
import styles from "./Planner.module.css";

const DROPPED_IMAGE_SIZE_PX = 45;
const BACKGROUND_WIDTH = 1127;
const BACKGROUND_HEIGHT = 634;

export default function Planner() {
	const { i18n } = useTranslation();
	const { htmlThemeClass } = useTheme();

	const [editor, setEditor] = React.useState<Editor | null>(null);
	const [imgOutlined, setImgOutlined] = React.useState(false);
	const [activeDragItem, setActiveDragItem] = React.useState<{
		src: string;
		previewPath: string;
	} | null>(null);

	const sensors = useSensors(useSensor(PointerSensor));

	const handleMount = React.useCallback(
		(mountedEditor: Editor) => {
			setEditor(mountedEditor);
			mountedEditor.user.updateUserPreferences({
				locale: ourLanguageToTldrawLanguage(i18n.language),
				colorScheme: htmlThemeClass === "dark" ? "dark" : "light",
			});
		},
		[i18n, htmlThemeClass],
	);

	const handleAddImage = React.useCallback(
		({
			src,
			size,
			isLocked,
			point,
			cb,
		}: {
			src: string;
			size: number[];
			isLocked: boolean;
			point: number[];
			cb?: () => void;
		}) => {
			if (!editor) return;

			// tldraw creator:
			// "So image shapes in tldraw work like this: we add an asset to the app.assets table, then we reference that asset in the shape object itself.
			// This lets us have multiple copies of an image on the canvas without having all of those take up memory individually"
			const assetId: TLAssetId = AssetRecordType.createId();

			const srcWithOutline = imgOutlined ? `${src}?outline=red` : src;

			// idk if this is the best solution, but it was the example given and it seems to cope well with lots of shapes at once
			const imageAsset: TLImageAsset = {
				id: assetId,
				type: "image",
				typeName: "asset",
				props: {
					name: "img",
					src: srcWithOutline,
					w: size[0],
					h: size[1],
					mimeType: null,
					isAnimated: false,
				},
				meta: {},
			};

			editor.createAssets([imageAsset]);

			const shapeId: TLShapeId = createShapeId();

			const shape = {
				type: "image",
				x: point[0],
				y: point[1],
				isLocked: isLocked,
				id: shapeId,
				props: {
					assetId: assetId,
					w: size[0],
					h: size[1],
				},
			};
			editor.createShape(shape);

			cb?.();
		},
		[editor, imgOutlined],
	);

	const handleAddWeaponAtPosition = React.useCallback(
		(src: string, point: [number, number]) => {
			const centeredPoint: [number, number] = [
				point[0] - DROPPED_IMAGE_SIZE_PX / 2,
				point[1] - DROPPED_IMAGE_SIZE_PX / 2,
			];

			handleAddImage({
				src,
				size: [DROPPED_IMAGE_SIZE_PX, DROPPED_IMAGE_SIZE_PX],
				isLocked: false,
				point: centeredPoint,
				cb: () => editor?.setCurrentTool("select"),
			});
		},
		[editor, handleAddImage],
	);

	const handleDragStart = (event: DragStartEvent) => {
		const { src, previewPath } = event.active.data.current as {
			src: string;
			previewPath: string;
		};
		setActiveDragItem({ src, previewPath });
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveDragItem(null);

		if (!editor) return;

		const { active } = event;
		const { src } = active.data.current as { src: string };

		const pointerPosition = event.activatorEvent as PointerEvent;
		const dropX = pointerPosition.clientX + (event.delta?.x ?? 0);
		const dropY = pointerPosition.clientY + (event.delta?.y ?? 0);

		const pagePoint = editor.screenToPage({ x: dropX, y: dropY });
		handleAddWeaponAtPosition(src, [pagePoint.x, pagePoint.y]);
	};

	const handleAddBackgroundImage = React.useCallback(
		(urlArgs: {
			stageId: StageId;
			mode: ModeShort;
			style: StageBackgroundStyle;
		}) => {
			if (!editor) return;

			editor.mark("pre-background-change");

			const shapes = editor.getCurrentPageShapes();
			// i dont think locked shapes can be deleted
			for (const value of shapes) {
				editor.updateShape({ id: value.id, type: value.type, isLocked: false });
			}
			editor.deleteShapes(shapes);

			handleAddImage({
				src: stageMinimapImageUrlWithEnding(urlArgs),
				size: [BACKGROUND_WIDTH, BACKGROUND_HEIGHT],
				isLocked: true,
				point: [0, 0],
			});

			editor.zoomToFit();
		},
		[editor, handleAddImage],
	);

	// removes all tldraw ui that isnt needed
	const tldrawComponents: TLComponents = {
		ActionsMenu: null,
		ContextMenu: null,
		DebugMenu: null,
		DebugPanel: null,
		HelperButtons: null,
		HelpMenu: null,
		KeyboardShortcutsDialog: null,
		MainMenu: null,
		MenuPanel: null,
		Minimap: null,
		NavigationPanel: null,
		PageMenu: null,
		QuickActions: null,
		SharePanel: null,
		StylePanel: CustomStylePanel,
		TopPanel: null,
		ZoomMenu: null,
	};

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<StageBackgroundSelector onAddBackground={handleAddBackgroundImage} />
			<OutlineToggle outlined={imgOutlined} setImgOutlined={setImgOutlined} />
			<WeaponImageSelector />
			<div style={{ position: "fixed", inset: 0 }}>
				<Tldraw onMount={handleMount} components={tldrawComponents} />
			</div>
			<DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
				{activeDragItem ? (
					<Image
						path={activeDragItem.previewPath}
						width={DROPPED_IMAGE_SIZE_PX}
						height={DROPPED_IMAGE_SIZE_PX}
						alt=""
						className={styles.dragPreview}
						containerClassName={styles.dragPreviewContainer}
					/>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// Formats the style panel so it can have classnames, this is needed so it can be moved below the header bar which blocks clicks (idk why this is different to the old version)
function CustomStylePanel(props: TLUiStylePanelProps) {
	return (
		<div className={styles.stylePanel}>
			<DefaultStylePanel {...props} />
		</div>
	);
}

function OutlineToggle({
	outlined,
	setImgOutlined,
}: {
	outlined?: boolean;
	setImgOutlined: (outline: boolean) => void;
}) {
	const { t } = useTranslation(["common"]);

	const handleClick = () => {
		setImgOutlined(!outlined);
	};

	return (
		<div className={styles.outlineToggle}>
			<SendouButton
				variant="minimal"
				onPress={handleClick}
				className={clsx(
					styles.outlineToggleButton,
					outlined && styles.outlineToggleButtonOutlined,
				)}
			>
				{outlined
					? t("common:actions.outlined")
					: t("common:actions.noOutline")}
			</SendouButton>
		</div>
	);
}

function DraggableWeaponButton({
	id,
	src,
	imgPath,
	previewPath,
	alt,
	title,
	size,
}: {
	id: string;
	src: string;
	imgPath: string;
	previewPath: string;
	alt: string;
	title: string;
	size: number;
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id,
		data: { src, previewPath },
	});

	return (
		<button
			type="button"
			ref={setNodeRef}
			className={clsx(
				styles.draggableButton,
				isDragging && styles.weaponDragging,
			)}
			{...listeners}
			{...attributes}
		>
			<Image
				alt={alt}
				title={title}
				path={imgPath}
				width={size}
				height={size}
			/>
		</button>
	);
}

function WeaponImageSelector() {
	const { t, i18n } = useTranslation(["weapons", "common", "game-misc"]);

	const isWide = i18n.language === "fr";

	return (
		<div
			className={clsx(
				styles.weaponsSection,
				"scrollbar",
				isWide && styles.weaponsSectionWide,
			)}
		>
			{weaponCategories.map((category) => {
				return (
					<details key={category.name}>
						<summary className={styles.weaponsSummary}>
							<Image
								path={weaponCategoryUrl(category.name)}
								width={24}
								height={24}
								alt={t(`common:weapon.category.${category.name}`)}
							/>
							{t(`common:weapon.category.${category.name}`)}
						</summary>
						<div className={styles.weaponsContainer}>
							{category.weaponIds.map((weaponId) => {
								return (
									<DraggableWeaponButton
										key={weaponId}
										id={`main-${weaponId}`}
										src={`${outlinedMainWeaponImageUrl(weaponId)}.png`}
										imgPath={mainWeaponImageUrl(weaponId)}
										previewPath={outlinedMainWeaponImageUrl(weaponId)}
										alt={t(`weapons:MAIN_${weaponId}`)}
										title={t(`weapons:MAIN_${weaponId}`)}
										size={36}
									/>
								);
							})}
						</div>
					</details>
				);
			})}
			<details>
				<summary className={styles.weaponsSummary}>
					<Image path={subWeaponImageUrl(0)} width={24} height={24} alt="" />
					{t("common:weapon.category.subs")}
				</summary>
				<div className={styles.weaponsContainer}>
					{subWeaponIds.map((subWeaponId) => {
						return (
							<DraggableWeaponButton
								key={subWeaponId}
								id={`sub-${subWeaponId}`}
								src={`${subWeaponImageUrl(subWeaponId)}.png`}
								imgPath={subWeaponImageUrl(subWeaponId)}
								previewPath={subWeaponImageUrl(subWeaponId)}
								alt={t(`weapons:SUB_${subWeaponId}`)}
								title={t(`weapons:SUB_${subWeaponId}`)}
								size={28}
							/>
						);
					})}
				</div>
			</details>
			<details>
				<summary className={styles.weaponsSummary}>
					<Image
						path={specialWeaponImageUrl(1)}
						width={24}
						height={24}
						alt=""
					/>
					{t("common:weapon.category.specials")}
				</summary>
				<div className={styles.weaponsContainer}>
					{specialWeaponIds.map((specialWeaponId) => {
						return (
							<DraggableWeaponButton
								key={specialWeaponId}
								id={`special-${specialWeaponId}`}
								src={`${specialWeaponImageUrl(specialWeaponId)}.png`}
								imgPath={specialWeaponImageUrl(specialWeaponId)}
								previewPath={specialWeaponImageUrl(specialWeaponId)}
								alt={t(`weapons:SPECIAL_${specialWeaponId}`)}
								title={t(`weapons:SPECIAL_${specialWeaponId}`)}
								size={28}
							/>
						);
					})}
				</div>
			</details>
			<details>
				<summary className={styles.weaponsSummary}>
					<Image path={modeImageUrl("RM")} width={24} height={24} alt="" />
					{t("common:plans.adder.objective")}
				</summary>
				<div className={styles.weaponsContainer}>
					{(["TC", "RM", "CB"] as const).map((mode) => {
						return (
							<DraggableWeaponButton
								key={mode}
								id={`mode-${mode}`}
								src={`${modeImageUrl(mode)}.png`}
								imgPath={modeImageUrl(mode)}
								previewPath={modeImageUrl(mode)}
								alt={t(`game-misc:MODE_LONG_${mode}`)}
								title={t(`game-misc:MODE_LONG_${mode}`)}
								size={28}
							/>
						);
					})}
				</div>
			</details>
		</div>
	);
}

const LAST_STAGE_ID_WITH_IMAGES = 24;
function StageBackgroundSelector({
	onAddBackground,
}: {
	onAddBackground: (args: {
		stageId: StageId;
		mode: ModeShort;
		style: StageBackgroundStyle;
	}) => void;
}) {
	const { t } = useTranslation(["game-misc", "common"]);
	const [stageId, setStageId] = React.useState<StageId>(stageIds[0]);
	const [mode, setMode] = React.useState<ModeShort>("SZ");
	const [backgroundStyle, setBackgroundStyle] =
		React.useState<StageBackgroundStyle>("MINI");

	const handleStageIdChange = (stageId: StageId) => {
		setStageId(stageId);
	};

	return (
		<div className={clsx(styles.topSection, "scrollbar planner")}>
			<select
				className="w-max"
				value={stageId}
				onChange={(e) => handleStageIdChange(Number(e.target.value) as StageId)}
				aria-label="Select stage"
			>
				{stageIds
					.filter((id) => id <= LAST_STAGE_ID_WITH_IMAGES)
					.map((stageId) => {
						return (
							<option value={stageId} key={stageId}>
								{t(`game-misc:STAGE_${stageId}`)}
							</option>
						);
					})}
			</select>
			<select
				className="w-max"
				value={mode}
				onChange={(e) => setMode(e.target.value as ModeShort)}
			>
				{modesShort.map((mode) => {
					return (
						<option key={mode} value={mode}>
							{t(`game-misc:MODE_LONG_${mode}`)}
						</option>
					);
				})}
			</select>
			<select
				className="w-max"
				value={backgroundStyle}
				onChange={(e) =>
					setBackgroundStyle(e.target.value as StageBackgroundStyle)
				}
			>
				{(["MINI", "OVER"] as const).map((style) => {
					return (
						<option key={style} value={style}>
							{t(`common:plans.bgStyle.${style}`)}
						</option>
					);
				})}
			</select>
			<SendouButton
				onPress={() =>
					onAddBackground({ style: backgroundStyle, stageId, mode })
				}
				className="w-max"
			>
				{t("common:actions.setBg")}
			</SendouButton>
			<LinkButton to="/" icon={<LogOut />} variant="outlined" shape="square" />
		</div>
	);
}

// when adding new language check from Tldraw codebase what is the matching
// language in TRANSLATIONS constant, or default to english if none found
const ourLanguageToTldrawLanguageMap: Record<LanguageCode, string> = {
	"es-US": "es",
	"es-ES": "es",
	ko: "ko-kr",
	nl: "en",
	zh: "zh-ch",
	he: "he",
	// map to itself
	da: "da",
	de: "de",
	en: "en",
	"fr-CA": "fr-CA",
	"fr-EU": "fr-EU",
	it: "it",
	ja: "ja",
	ru: "ru",
	pl: "pl",
	"pt-BR": "pt-br",
};
function ourLanguageToTldrawLanguage(ourLanguageUserSelected: string) {
	for (const [ourLanguage, tldrawLanguage] of Object.entries(
		ourLanguageToTldrawLanguageMap,
	)) {
		if (ourLanguage === ourLanguageUserSelected) {
			return tldrawLanguage;
		}
	}

	logger.error(`No tldraw language found for: ${ourLanguageUserSelected}`);
	return "en";
}
