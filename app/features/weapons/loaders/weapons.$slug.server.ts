import type { LoaderFunctionArgs } from "react-router";
import { i18next } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";

// xxx: actual data here
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["weapons"], {
		lng: "en",
	});
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		throw new Response(null, { status: 404 });
	}

	const weaponName = t(`weapons:MAIN_${weaponId}`);
	const slug = mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));

	return {
		weaponId,
		weaponName,
		slug,
	};
};
