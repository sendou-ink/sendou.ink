import { useState } from "react";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { COMP_ANALYZER_URL, navIconUrl } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import { useCategorization, useSelectedWeapons } from "../comp-analyzer-hooks";
import { DamageComboList } from "../components/DamageComboBar";
import { RangeVisualization } from "../components/RangeVisualization";
import { SelectedWeapons } from "../components/SelectedWeapons";
import { WeaponCategories } from "../components/WeaponCategories";
import { WeaponGrid } from "../components/WeaponGrid";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Composition Analyzer",
		ogTitle: "Splatoon 3 composition analyzer",
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
	const isMounted = useIsMounted();

	if (!isMounted) {
		return <Placeholder />;
	}

	return <CompAnalyzerPage />;
}

function CompAnalyzerPage() {
	const [selectedWeaponIds, setSelectedWeaponIds] = useSelectedWeapons();
	const [categorization, setCategorization] = useCategorization();
	const [isGridCollapsed, setIsGridCollapsed] = useState(
		selectedWeaponIds.length >= MAX_WEAPONS,
	);

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
			/>
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
			<DamageComboList weaponIds={selectedWeaponIds} />
		</Main>
	);
}
