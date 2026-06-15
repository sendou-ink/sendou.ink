import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { outlinedMainWeaponImageUrl } from "~/utils/urls";
import { WeaponKits } from "../components/WeaponKits";
import { WeaponParamsTable } from "../components/WeaponParamsTable";
import { loader } from "../loaders/params.$slug.server";

export { loader };

import styles from "./params.$slug.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "common"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;
		if (!data) return [];
		return [
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: `/params/${data.slug}`,
				type: "IMAGE",
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];
	return metaTags({
		title: args.data.weaponName,
		description: `${args.data.weaponName} parameters with version history compared across the weapon's category.`,
		location: args.location,
	});
};

// xxx: top row = points for special

export default function WeaponParamsPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "weapons"]);

	return (
		<Main className={styles.container} bigger>
			<WeaponKits kits={data.kits} />
			<WeaponParamsTable
				currentWeaponId={data.weaponId}
				categoryWeaponIds={data.categoryWeaponIds}
				weaponParams={data.weaponParams}
				versions={data.versions}
			/>
			<a
				href="https://leanny.github.io/"
				target="_blank"
				rel="noopener noreferrer"
				className={styles.dataCredit}
			>
				{t("common:dataCredit.lean")}
			</a>
		</Main>
	);
}
