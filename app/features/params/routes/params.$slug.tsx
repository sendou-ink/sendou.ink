import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	outlinedMainWeaponImageUrl,
	specialWeaponImageUrl,
	subWeaponImageUrl,
	weaponParamsPage,
} from "~/utils/urls";
import { WeaponParamsView } from "../components/WeaponParamsView";
import { loader } from "../loaders/params.$slug.server";
import type { WeaponParamKind } from "../weapon-params-types";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "common", "analyzer", "params"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;
		if (!data) return [];
		return [
			{
				imgPath: weaponImageUrl(data.kind, data.weaponId),
				href: weaponParamsPage(data.slug),
				type: "IMAGE",
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];
	return metaTags({
		title: args.data.weaponName,
		description: `${args.data.weaponName} parameters with version history compared across ${comparedAcross(args.data.kind)}.`,
		location: args.location,
	});
};

export default function WeaponParamsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<WeaponParamsView
			kind={data.kind}
			weaponId={data.weaponId}
			categoryWeaponIds={data.categoryWeaponIds}
			weaponParams={data.weaponParams}
			specialPoints={data.specialPoints}
			damageMultipliers={data.damageMultipliers}
			versions={data.versions}
			patchHistory={data.patchHistory}
			kitPatchHistories={data.kitPatchHistories}
			kits={data.kits}
		/>
	);
}

function weaponImageUrl(kind: WeaponParamKind, weaponId: number) {
	if (kind === "sub") return subWeaponImageUrl(weaponId as SubWeaponId);
	if (kind === "special") {
		return specialWeaponImageUrl(weaponId as SpecialWeaponId);
	}
	return outlinedMainWeaponImageUrl(weaponId as MainWeaponId);
}

function comparedAcross(kind: WeaponParamKind) {
	if (kind === "sub") return "all sub weapons";
	if (kind === "special") return "all special weapons";
	return "the weapon's category";
}
