import { Main } from "~/components/Main";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	weaponCategories,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { RangeVisualization } from "../components/RangeVisualization";

export default function AllRangesPage() {
	return (
		<Main className="stack lg">
			<h1>All Weapon Ranges (Dev)</h1>
			{weaponCategories.map((category) => {
				const baseWeaponIds: MainWeaponId[] = category.weaponIds.flatMap(
					(id): MainWeaponId[] => {
						const weaponId = id as MainWeaponId;
						return weaponIdToType(weaponId) === "BASE" ? [weaponId] : [];
					},
				);

				if (baseWeaponIds.length === 0) {
					return null;
				}

				return (
					<section key={category.name}>
						<h2 style={{ textTransform: "capitalize" }}>
							{category.name.toLowerCase()}
						</h2>
						<RangeVisualization weaponIds={baseWeaponIds} />
					</section>
				);
			})}
		</Main>
	);
}
