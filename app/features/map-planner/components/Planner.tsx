import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	TouchSensor,
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
	type TldrawOptions,
} from "@tldraw/tldraw";
import clsx from "clsx";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	LogOut,
	Radius,
	Square,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { getSpecialWeaponRange } from "~/features/comp-analyzer/core/special-weapon-range";
import { getWeaponRange } from "~/features/comp-analyzer/core/weapon-range";
import { useTheme } from "~/features/theme/core/provider";
import type { LanguageCode } from "~/modules/i18n/config";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds, stagesObj } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	SpecialWeaponId,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
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
import {
	PLANNER_BACKGROUND_STYLES,
	PLANNER_PERSISTENCE_KEY,
	STAGE_WATER_LEVELS,
} from "../plans-constants";
import { plansSearchParams } from "../plans-search-params";
import type { StageWaterLevel } from "../plans-types";
import styles from "./Planner.module.css";

const DROPPED_IMAGE_SIZE_PX = 45;
const BACKGROUND_WIDTH = 1127;
const BACKGROUND_HEIGHT = 634;
const GAME_UNITS_TO_PX: Record<"MINI" | "OVER", number> = {
	MINI: 4.4,
	OVER: 8.4,
};
// the menu panel that normally holds undo & redo is hidden, so they are moved to the toolbar
const TLDRAW_OPTIONS: Partial<TldrawOptions> = {
	actionShortcutsLocation: "toolbar",
};
const MAIN_WEAPON_URL_PATTERN = /main-weapons-outlined\/(\d+)/;
const SPECIAL_WEAPON_URL_PATTERN = /special-weapons\/(\d+)/;

export default function Planner() {
	const { t, i18n } = useTranslation(["common"]);
	const { htmlThemeClass } = useTheme();

	const isWide = i18n.language.startsWith("fr");

	const [editor, setEditor] = React.useState<Editor | null>(null);
	const [imgOutlined, setImgOutlined] = useSearchParam(
		plansSearchParams,
		"outlined",
	);
	const [topCollapsed, setTopCollapsed] = useSearchParam(
		plansSearchParams,
		"hideTop",
	);
	const [weaponsCollapsed, setWeaponsCollapsed] = useSearchParam(
		plansSearchParams,
		"hideWeapons",
	);
	const [rangesVisible, setRangesVisible] = useSearchParam(
		plansSearchParams,
		"ranges",
	);
	const rangeCleanupRef = React.useRef<(() => void) | null>(null);
	const [activeDragItem, setActiveDragItem] = React.useState<{
		src: string;
		previewPath: string;
	} | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 200,
				tolerance: 5,
			},
		}),
	);

	const showRanges = React.useCallback((editorToUse: Editor) => {
		const gameUnitsToPx = GAME_UNITS_TO_PX[canvasBackgroundStyle(editorToUse)];
		removeRangeCircles(editorToUse);
		for (const shape of editorToUse.getCurrentPageShapes()) {
			createRangeCircleForShape(editorToUse, shape, gameUnitsToPx);
		}

		const unsubCreate = editorToUse.sideEffects.registerAfterCreateHandler(
			"shape",
			(shape) => {
				if (shape.meta.isRangeCircle) return;
				createRangeCircleForShape(editorToUse, shape, gameUnitsToPx);
			},
		);

		const unsubChange = editorToUse.sideEffects.registerAfterChangeHandler(
			"shape",
			(_prev, next) => {
				if (next.meta.isRangeCircle) return;

				const rangeCircles = editorToUse
					.getCurrentPageShapes()
					.filter(
						(s) =>
							s.meta.isRangeCircle === true && s.meta.weaponShapeId === next.id,
					);
				if (rangeCircles.length === 0) return;

				const centerX = next.x + (next.props as { w: number }).w / 2;
				const centerY = next.y + (next.props as { h: number }).h / 2;

				for (const rangeCircle of rangeCircles) {
					const radiusPx = (rangeCircle.props as { w: number }).w / 2;
					editorToUse.updateShape({
						id: rangeCircle.id,
						type: rangeCircle.type,
						isLocked: false,
					});
					editorToUse.updateShape({
						id: rangeCircle.id,
						type: rangeCircle.type,
						x: centerX - radiusPx,
						y: centerY - radiusPx,
						isLocked: true,
					});
				}
			},
		);

		const unsubDelete = editorToUse.sideEffects.registerAfterDeleteHandler(
			"shape",
			(shape) => {
				if (shape.meta.isRangeCircle) return;

				const rangeCircles = editorToUse
					.getCurrentPageShapes()
					.filter(
						(s) =>
							s.meta.isRangeCircle === true &&
							s.meta.weaponShapeId === shape.id,
					);
				if (rangeCircles.length === 0) return;

				for (const rangeCircle of rangeCircles) {
					editorToUse.updateShape({
						id: rangeCircle.id,
						type: rangeCircle.type,
						isLocked: false,
					});
				}
				editorToUse.deleteShapes(rangeCircles);
			},
		);

		rangeCleanupRef.current = () => {
			unsubCreate();
			unsubChange();
			unsubDelete();
		};
	}, []);

	const hideRanges = React.useCallback((editorToUse: Editor) => {
		rangeCleanupRef.current?.();
		rangeCleanupRef.current = null;
		removeRangeCircles(editorToUse);
	}, []);

	const handleMount = React.useCallback(
		(mountedEditor: Editor) => {
			setEditor(mountedEditor);
			mountedEditor.user.updateUserPreferences({
				locale: ourLanguageToTldrawLanguage(i18n.language),
				colorScheme: htmlThemeClass === "dark" ? "dark" : "light",
			});

			// a restored plan can hold range circles that no side effect handler is watching anymore
			mountedEditor.run(
				() => {
					if (rangesVisible) {
						showRanges(mountedEditor);
					} else {
						removeRangeCircles(mountedEditor);
					}
				},
				{ history: "ignore" },
			);
		},
		[i18n, htmlThemeClass, rangesVisible, showRanges],
	);

	const handleAddImage = React.useCallback(
		({
			src,
			size,
			isLocked,
			point,
			meta,
			cb,
		}: {
			src: string;
			size: number[];
			isLocked: boolean;
			point: number[];
			meta?: { backgroundStyle?: "MINI" | "OVER" };
			cb?: () => void;
		}) => {
			if (!editor) return;

			// image shapes reference an asset by id, so copies of the same image only take up memory once
			const assetId: TLAssetId = AssetRecordType.createId();

			const srcWithOutline = imgOutlined ? `${src}?outline=red` : src;

			// follows tldraw's own example, copes well with lots of shapes at once
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
				meta: meta ?? {},
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

	const handleRangeToggle = () => {
		if (!editor) return;

		if (rangesVisible) {
			hideRanges(editor);
		} else {
			showRanges(editor);
		}
		setRangesVisible(!rangesVisible);
	};

	const handleAddBackgroundImage = React.useCallback(
		(urlArgs: {
			stageId: StageId;
			mode: ModeShort;
			style: "MINI" | "OVER";
			waterLevel: StageWaterLevel;
		}) => {
			if (!editor) return;

			editor.mark("pre-background-change");

			hideRanges(editor);
			setRangesVisible(false);

			const shapes = editor.getCurrentPageShapes();
			// locked shapes can't be deleted
			for (const value of shapes) {
				editor.updateShape({ id: value.id, type: value.type, isLocked: false });
			}
			editor.deleteShapes(shapes);

			handleAddImage({
				src: stageMinimapImageUrlWithEnding(urlArgs),
				size: [BACKGROUND_WIDTH, BACKGROUND_HEIGHT],
				isLocked: true,
				point: [0, 0],
				meta: { backgroundStyle: urlArgs.style },
			});

			editor.zoomToFit();
		},
		[editor, handleAddImage, hideRanges, setRangesVisible],
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
			<div
				className={clsx(
					styles.topWrapper,
					topCollapsed && styles.topWrapperCollapsed,
				)}
			>
				<StageBackgroundSelector onAddBackground={handleAddBackgroundImage} />
				<button
					type="button"
					className={styles.topToggle}
					onClick={() => setTopCollapsed(!topCollapsed)}
					aria-label={
						topCollapsed
							? t("common:actions.showMore")
							: t("common:actions.hide")
					}
				>
					{topCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
				</button>
			</div>
			<div
				className={clsx(
					styles.weaponsWrapper,
					weaponsCollapsed && styles.weaponsWrapperCollapsed,
				)}
			>
				<div
					className={clsx(
						styles.weaponsSection,
						"scrollbar",
						isWide && styles.weaponsSectionWide,
					)}
				>
					<OutlineToggle
						outlined={imgOutlined}
						setImgOutlined={setImgOutlined}
					/>
					<RangeToggle active={rangesVisible} onToggle={handleRangeToggle} />
					<WeaponImageSelector />
				</div>
				<button
					type="button"
					className={styles.weaponsToggle}
					onClick={() => setWeaponsCollapsed(!weaponsCollapsed)}
					aria-label={
						weaponsCollapsed
							? t("common:actions.showMore")
							: t("common:actions.hide")
					}
				>
					{weaponsCollapsed ? (
						<ChevronRight size={16} />
					) : (
						<ChevronLeft size={16} />
					)}
				</button>
			</div>
			<div style={{ position: "fixed", inset: 0 }}>
				<Tldraw
					persistenceKey={PLANNER_PERSISTENCE_KEY}
					onMount={handleMount}
					components={tldrawComponents}
					options={TLDRAW_OPTIONS}
				/>
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

// styled to sit below the header bar, which otherwise blocks clicks on it
function CustomStylePanel(props: TLUiStylePanelProps) {
	return (
		<div className={props.isMobile ? undefined : styles.stylePanel}>
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
		<SendouButton
			variant="minimal"
			onPress={handleClick}
			icon={<Square />}
			className={clsx(
				styles.outlineToggleButton,
				outlined && styles.outlineToggleButtonOutlined,
			)}
		>
			{outlined ? t("common:actions.outlined") : t("common:actions.noOutline")}
		</SendouButton>
	);
}

function RangeToggle({
	active,
	onToggle,
}: {
	active: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			variant="minimal"
			onPress={onToggle}
			icon={<Radius />}
			className={clsx(
				styles.outlineToggleButton,
				active && styles.outlineToggleButtonOutlined,
			)}
		>
			{t("common:plans.ranges")}
		</SendouButton>
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
	const { t } = useTranslation(["weapons", "common", "game-misc"]);

	return (
		<>
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
							<span className={styles.weaponsSummaryText}>
								{t(`common:weapon.category.${category.name}`)}
							</span>
						</summary>
						<div className={styles.weaponsContainer}>
							{category.weaponIds.map((weaponId) => {
								return (
									<DraggableWeaponButton
										key={weaponId}
										id={`main-${weaponId}`}
										src={`${outlinedMainWeaponImageUrl(weaponId)}.avif`}
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
					<span className={styles.weaponsSummaryText}>
						{t("common:weapon.category.subs")}
					</span>
				</summary>
				<div className={styles.weaponsContainer}>
					{subWeaponIds.map((subWeaponId) => {
						return (
							<DraggableWeaponButton
								key={subWeaponId}
								id={`sub-${subWeaponId}`}
								src={`${subWeaponImageUrl(subWeaponId)}.avif`}
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
					<span className={styles.weaponsSummaryText}>
						{t("common:weapon.category.specials")}
					</span>
				</summary>
				<div className={styles.weaponsContainer}>
					{specialWeaponIds.map((specialWeaponId) => {
						return (
							<DraggableWeaponButton
								key={specialWeaponId}
								id={`special-${specialWeaponId}`}
								src={`${specialWeaponImageUrl(specialWeaponId)}.avif`}
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
					<span className={styles.weaponsSummaryText}>
						{t("common:plans.adder.objective")}
					</span>
				</summary>
				<div className={styles.weaponsContainer}>
					{(["TC", "RM", "CB"] as const).map((mode) => {
						return (
							<DraggableWeaponButton
								key={mode}
								id={`mode-${mode}`}
								src={`${modeImageUrl(mode)}.avif`}
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
		</>
	);
}

const LAST_STAGE_ID_WITH_IMAGES = 24;
function StageBackgroundSelector({
	onAddBackground,
}: {
	onAddBackground: (args: {
		stageId: StageId;
		mode: ModeShort;
		style: "MINI" | "OVER";
		waterLevel: StageWaterLevel;
	}) => void;
}) {
	const { t } = useTranslation(["game-misc", "common"]);
	const [
		{ stage: stageId, mode, style: backgroundStyle, water: waterLevel },
		setParams,
	] = useSearchParamsTyped(plansSearchParams);

	const handleStageIdChange = (stageId: StageId) => {
		setParams({
			stage: stageId,
			water: stageId === stagesObj.MAHI_MAHI_RESORT ? waterLevel : "up",
		});
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
				onChange={(e) => setParams({ mode: e.target.value as ModeShort })}
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
					setParams({ style: e.target.value as "MINI" | "OVER" })
				}
			>
				{PLANNER_BACKGROUND_STYLES.map((style) => {
					return (
						<option key={style} value={style}>
							{t(`common:plans.bgStyle.${style}`)}
						</option>
					);
				})}
			</select>
			{stageId === stagesObj.MAHI_MAHI_RESORT ? (
				<select
					className="w-max"
					value={waterLevel}
					onChange={(e) =>
						setParams({ water: e.target.value as StageWaterLevel })
					}
				>
					{STAGE_WATER_LEVELS.map((level) => {
						return (
							<option key={level} value={level}>
								{t(`common:plans.waterLevel.${level}`)}
							</option>
						);
					})}
				</select>
			) : null}
			<SendouButton
				onPress={() =>
					onAddBackground({ style: backgroundStyle, stageId, mode, waterLevel })
				}
				className="w-max"
			>
				{t("common:actions.setBg")}
			</SendouButton>
			<LinkButton to="/" icon={<LogOut />} variant="outlined" shape="square" />
		</div>
	);
}

// for a new language check tldraw's TRANSLATIONS constant for the matching one, default to english
const ourLanguageToTldrawLanguageMap: Record<LanguageCode, string> = {
	"es-US": "es",
	"es-ES": "es",
	ko: "ko-kr",
	nl: "nl",
	zh: "zh-cn",
	"fr-CA": "fr",
	"fr-EU": "fr",
	"pt-BR": "pt-br",
	// map to itself
	da: "da",
	de: "de",
	en: "en",
	he: "he",
	it: "it",
	ja: "ja",
	ru: "ru",
	pl: "pl",
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

function extractMainWeaponIdFromSrc(src: string): MainWeaponId | null {
	const match = src.match(MAIN_WEAPON_URL_PATTERN);
	if (!match) return null;

	const id = Number(match[1]);
	if (!mainWeaponIds.includes(id as MainWeaponId)) return null;

	return id as MainWeaponId;
}

function extractSpecialWeaponIdFromSrc(src: string): SpecialWeaponId | null {
	const match = src.match(SPECIAL_WEAPON_URL_PATTERN);
	if (!match) return null;

	const id = Number(match[1]);
	if (!specialWeaponIds.includes(id as SpecialWeaponId)) return null;

	return id as SpecialWeaponId;
}

function rangeForSrc(
	src: string,
): { range: number; blastRadius?: number } | null {
	const mainWeaponId = extractMainWeaponIdFromSrc(src);
	if (mainWeaponId !== null) {
		const result = getWeaponRange(mainWeaponId);
		if (result.rangeType === "unsupported" || result.range <= 0) return null;
		return { range: result.range, blastRadius: result.blastRadius };
	}

	const specialWeaponId = extractSpecialWeaponIdFromSrc(src);
	if (specialWeaponId !== null) {
		const result = getSpecialWeaponRange(specialWeaponId);
		if (!result || result.range <= 0) return null;
		return { range: result.range, blastRadius: result.blastRadius };
	}

	return null;
}

function createRangeCircleForShape(
	editor: Editor,
	shape: ReturnType<Editor["getCurrentPageShapes"]>[number],
	gameUnitsToPx: number,
) {
	if (shape.type !== "image") return;

	const assetId = (shape.props as { assetId?: string }).assetId;
	if (!assetId) return;

	const asset = editor.getAsset(assetId as TLAssetId);
	if (asset?.type !== "image" || !asset.props.src) return;

	const rangeResult = rangeForSrc(asset.props.src);
	if (!rangeResult) return;

	const centerX = shape.x + (shape.props as { w: number }).w / 2;
	const centerY = shape.y + (shape.props as { h: number }).h / 2;

	if (typeof rangeResult.blastRadius === "number") {
		createCircle(editor, {
			centerX,
			centerY,
			radiusPx: (rangeResult.range + rangeResult.blastRadius) * gameUnitsToPx,
			color: "blue",
			weaponShapeId: shape.id,
		});
	}

	createCircle(editor, {
		centerX,
		centerY,
		radiusPx: rangeResult.range * gameUnitsToPx,
		color: "red",
		weaponShapeId: shape.id,
	});

	editor.bringToFront([shape.id]);
}

function createCircle(
	editor: Editor,
	{
		centerX,
		centerY,
		radiusPx,
		color,
		weaponShapeId,
	}: {
		centerX: number;
		centerY: number;
		radiusPx: number;
		color: "red" | "blue";
		weaponShapeId: TLShapeId;
	},
) {
	const diameter = radiusPx * 2;
	editor.createShape({
		type: "geo",
		x: centerX - radiusPx,
		y: centerY - radiusPx,
		isLocked: true,
		opacity: 0.3,
		props: {
			geo: "ellipse",
			w: diameter,
			h: diameter,
			color,
			fill: "solid",
			dash: "solid",
			size: "s",
		},
		meta: { isRangeCircle: true, weaponShapeId },
	});
}

function canvasBackgroundStyle(editor: Editor): "MINI" | "OVER" {
	for (const shape of editor.getCurrentPageShapes()) {
		const style = shape.meta.backgroundStyle;
		if (style === "MINI" || style === "OVER") return style;
	}

	return "MINI";
}

function removeRangeCircles(editor: Editor) {
	const shapes = editor.getCurrentPageShapes();
	const rangeShapes = shapes.filter(
		(shape) => shape.meta.isRangeCircle === true,
	);

	if (rangeShapes.length === 0) return;

	for (const rangeShape of rangeShapes) {
		editor.updateShape({
			id: rangeShape.id,
			type: rangeShape.type,
			isLocked: false,
		});
	}
	editor.deleteShapes(rangeShapes);
}
