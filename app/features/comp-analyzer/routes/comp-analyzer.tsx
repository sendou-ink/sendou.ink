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
	useSelectedWeapons,
	useSingleWeaponCombos,
	useTargetSubDefenseAp,
} from "../comp-analyzer-hooks";
import { DamageComboList } from "../components/DamageComboBar";
import { RangeVisualization } from "../components/RangeVisualization";
import { SelectedWeapons } from "../components/SelectedWeapons";
import { WeaponCategories } from "../components/WeaponCategories";
import { WeaponGrid } from "../components/WeaponGrid";
import {
	calculateDamageCombos,
	type ExcludedDamageKey,
} from "../core/damage-combinations";

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
		ExcludedDamageKey[]
	>([]);

	const handleWeaponClick = (weaponId: MainWeaponId) => {
		if (selectedWeaponIds.length >= MAX_WEAPONS) {
			return;
		}

		const newSelectedWeapons = [...selectedWeaponIds, weaponId];
		setSelectedWeaponIds(newSelectedWeapons);

		if (newSelectedWeapons.length >= MAX_WEAPONS) {
			setIsGridCollapsed(true);
		}
	};

	const handleRemoveWeapon = (index: number) => {
		if (selectedWeaponIds.length >= MAX_WEAPONS) {
			setIsGridCollapsed(false);
		}
		setSelectedWeaponIds(selectedWeaponIds.filter((_, i) => i !== index));
	};

	return (
		<Main className="stack lg">
			<SelectedWeapons
				selectedWeaponIds={selectedWeaponIds}
				onRemove={handleRemoveWeapon}
				onReorder={setSelectedWeaponIds}
			/>
			<div className="stack horizontal justify-end">
				{selectedWeaponIds.length >= MAX_WEAPONS ? (
					<CompExportDialog
						weaponIds={selectedWeaponIds}
						excludedDamageKeys={excludedDamageKeys}
					/>
				) : (
					<SendouPopover trigger={<ExportButton />}>
						{t("analyzer:comp.exportHint", { max: MAX_WEAPONS })}
					</SendouPopover>
				)}
			</div>
			<WeaponCategories selectedWeaponIds={selectedWeaponIds} />
			<WeaponGrid
				selectedWeaponIds={selectedWeaponIds}
				onWeaponClick={handleWeaponClick}
				categorization={categorization}
				onCategorizationChange={setCategorization}
				isCollapsed={isGridCollapsed}
				onToggleCollapse={() => setIsGridCollapsed(!isGridCollapsed)}
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
	excludedDamageKeys: ExcludedDamageKey[];
}

function CompExportDialog({ weaponIds, excludedDamageKeys }: CompExportProps) {
	const { t } = useTranslation(["common", "analyzer"]);
	const [title, setTitle] = useState("");
	const [showRanges, setShowRanges] = useState(true);
	const [showCombos, setShowCombos] = useState(true);

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
						onChange={(e) => setTitle(e.target.value)}
						placeholder={t("common:imageExport.title")}
						aria-label={t("common:imageExport.title")}
					/>
					<SendouSwitch isSelected={showRanges} onChange={setShowRanges}>
						{t("analyzer:comp.weaponRanges")}
					</SendouSwitch>
					<SendouSwitch isSelected={showCombos} onChange={setShowCombos}>
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

	const combos = calculateDamageCombos(
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
