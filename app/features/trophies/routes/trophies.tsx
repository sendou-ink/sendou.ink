import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { Trophy, TrophyContextProvider } from "~/components/Trophy";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, TROPHIES_PAGE } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import { loader } from "../loaders/trophies.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: "trophies",
	breadcrumb: () => ({
		imgPath: navIconUrl("trophies"),
		href: TROPHIES_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Trophies",
		ogTitle: "Splatoon trophies for tournaments",
		location: args.location,
		description:
			"A full list of all trophies that can be won in Splatoon tournaments.",
	});
};

export default function TrophiesPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main>
			<h1>{t("trophies:title")}</h1>
			<TrophyContextProvider>
				{data.trophies.map((trophy) => (
					<Trophy key={trophy.id} model={trophy.model} />
				))}
			</TrophyContextProvider>
		</Main>
	);
}
