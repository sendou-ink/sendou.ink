import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { COMP_ANALYZER_URL, navIconUrl } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

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
		imgPath: navIconUrl("analyzer"),
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
	return <Main>hello world</Main>;
}
