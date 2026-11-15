import { HardDriveDownload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { CompGraphic } from "~/features/img-export/components/CompGraphic";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import { useHydrated } from "~/hooks/useHydrated";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { COMP_ANALYZER_URL, navIconUrl } from "~/utils/urls";
import { metaTags, ogPageImage } from "../../../utils/remix";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import {
	useCategorization,
	useHiddenRanges,
	useRangeVariants,
	useSelectedWeapons,
	useSingleWeaponCombos,
	useSpecialRanges,
	useTargetSubDefenseAp,
} from "../comp-analyzer-hooks";
import { DamageComboList } from "../components/DamageComboBar";
import { RangeVisualization } from "../components/RangeVisualization";
import { SelectedWeapons } from "../components/SelectedWeapons";
import { WeaponCategories } from "../components/WeaponCategories";
import { WeaponGrid } from "../components/WeaponGrid";
import * as DamageCombos from "../core/DamageCombos";
import styles from "./comp-analyzer.module.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Composition Analyzer",
		ogTitle: "Splatoon 3 composition analyzer",
		image: ogPageImage("comp-analyzer"),
		location: args.location,
		description:
			"Analyze team compositions and discover damage combo synergies between weapons in Splatoon 3.",
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "analyzer"],
	breadcrumb: () => ({
		imgPath: navIconUrl("comp-analyzer"),
		href: COMP_ANALYZER_URL,
		type: "IMAGE",
	}),
};

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export default function CompAnalyzerShell() {
	const isHydrated = useHydrated();

	if (!isHydrated) {
		return <Placeholder />;
	}

	return <CompAnalyzerPage />;
}

function CompAnalyzerPage() {
	const { t } = useTranslation(["common", "analyzer"]);
	const [selectedWeaponIds, setSelectedWeaponIds] = useSelectedWeapons();
	const [categorization, setCategorization] = useCategorization();
	const [isGridCollapsed, setIsGridCollapsed] = useState(
		selectedWeaponIds.length >= MAX_WEAPONS,
	);
	const [excludedDamageKeys, setExcludedDamageKeys] = useState<
		DamageCombos.ExcludedDamageKey[]
	>([]);
	const [exportSettings, setExportSettings] = useState<CompExportSettings>({
		title: "",
		showRanges: true,
		showCombos: true,
	});

	const handleWeaponClick = (weaponId: MainWeaponId) => {
		if (selectedWeaponIds.length >= MAX_WEAPONS) {
			return;
		}

		setSelectedWeaponIds([...selectedWeaponIds, weaponId]);
	};

	const handleRemoveWeapon = (index: number) => {
		setSelectedWeaponIds(selectedWeaponIds.filter((_, i) => i !== index));
	};

	const exportAction =
		selectedWeaponIds.length >= MAX_WEAPONS ? (
			<CompExportDialog
				weaponIds={selectedWeaponIds}
				excludedDamageKeys={excludedDamageKeys}
				settings={exportSettings}
				onSettingsChange={setExportSettings}
			/>
		) : (
			<SendouPopover trigger={<ExportButton />}>
				{t("analyzer:comp.exportHint", { max: MAX_WEAPONS })}
			</SendouPopover>
		);

	return (
		<Main bigger className="stack lg">
			<div className={styles.selectedWeaponsColumn}>
				<SelectedWeapons
					selectedWeaponIds={selectedWeaponIds}
					onRemove={handleRemoveWeapon}
					onReorder={setSelectedWeaponIds}
				/>
			</div>
			<WeaponCategories selectedWeaponIds={selectedWeaponIds} />
			<div className={styles.narrowOnly}>{exportAction}</div>
			<WeaponGrid
				selectedWeaponIds={selectedWeaponIds}
				onWeaponClick={handleWeaponClick}
				categorization={categorization}
				onCategorizationChange={setCategorization}
				isCollapsed={isGridCollapsed}
				onToggleCollapse={() => setIsGridCollapsed(!isGridCollapsed)}
				actions={<div className={styles.wideOnly}>{exportAction}</div>}
			/>
			<RangeVisualization weaponIds={selectedWeaponIds} />
			<DamageComboList
				weaponIds={selectedWeaponIds}
				excludedKeys={excludedDamageKeys}
				onExcludedKeysChange={setExcludedDamageKeys}
			/>
		</Main>
	);
}

interface CompExportProps {
	weaponIds: MainWeaponId[];
	excludedDamageKeys: DamageCombos.ExcludedDamageKey[];
}

/** Lives in the page, the export button is rendered in two places (wide and narrow layout) that share it */
interface CompExportSettings {
	title: string;
	showRanges: boolean;
	showCombos: boolean;
}

function CompExportDialog({
	weaponIds,
	excludedDamageKeys,
	settings,
	onSettingsChange,
}: CompExportProps & {
	settings: CompExportSettings;
	onSettingsChange: (settings: CompExportSettings) => void;
}) {
	const { t } = useTranslation(["common", "analyzer"]);
	const { title, showRanges, showCombos } = settings;

	return (
		<ImageExportDialog
			trigger={<ExportButton />}
			heading={t("common:imageExport.export")}
			filename="comp"
			settings={
				<>
					<input
						type="text"
						value={title}
						onChange={(e) =>
							onSettingsChange({ ...settings, title: e.target.value })
						}
						placeholder={t("common:imageExport.title")}
						aria-label={t("common:imageExport.title")}
					/>
					<SendouSwitch
						isSelected={showRanges}
						onChange={(isSelected) =>
							onSettingsChange({ ...settings, showRanges: isSelected })
						}
					>
						{t("analyzer:comp.weaponRanges")}
					</SendouSwitch>
					<SendouSwitch
						isSelected={showCombos}
						onChange={(isSelected) =>
							onSettingsChange({ ...settings, showCombos: isSelected })
						}
					>
						{t("analyzer:comp.damageCombos")}
					</SendouSwitch>
				</>
			}
		>
			<CompGraphicWithCombos
				weaponIds={weaponIds}
				excludedDamageKeys={excludedDamageKeys}
				title={title.trim()}
				showRanges={showRanges}
				showCombos={showCombos}
			/>
		</ImageExportDialog>
	);
}

/** Combos are only computed once the dialog opens (its content is lazy) */
function CompGraphicWithCombos({
	weaponIds,
	excludedDamageKeys,
	title,
	showRanges,
	showCombos,
}: CompExportProps & {
	title: string;
	showRanges: boolean;
	showCombos: boolean;
}) {
	const [singleWeaponCombos] = useSingleWeaponCombos();
	const [targetSubDefenseAp] = useTargetSubDefenseAp();
	const { enabledVariantKeys } = useRangeVariants();
	const { hiddenWeaponIds } = useHiddenRanges();
	const [showSpecialRanges] = useSpecialRanges();

	const combos = DamageCombos.calculate(
		weaponIds,
		excludedDamageKeys,
		targetSubDefenseAp,
		undefined,
		weaponIds.length === 1 || singleWeaponCombos,
	);

	return (
		<CompGraphic
			weaponIds={weaponIds}
			combos={combos}
			title={title}
			showRanges={showRanges}
			showCombos={showCombos}
			enabledVariantKeys={enabledVariantKeys}
			hiddenRangeWeaponIds={hiddenWeaponIds}
			showSpecialRanges={showSpecialRanges}
		/>
	);
}

function ExportButton(props: SendouButtonProps) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			{...props}
			size="small"
			variant="outlined"
			icon={<HardDriveDownload />}
		>
			{t("common:imageExport.export")}
		</SendouButton>
	);
}
