import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Pagination } from "~/components/Pagination";
import {
	VodListing,
	VodListingList,
} from "~/features/vods/components/VodListing";
import { userVodsSearchParams } from "~/features/vods/vods-search-params";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.vods.server";
import { useUserPageLayoutData } from "../user-page-hooks";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
};

export default function UserVodsPage() {
	const data = useLoaderData<typeof loader>();
	const layoutData = useUserPageLayoutData();
	const { t } = useTranslation(["common"]);

	const pagination = useSearchParamPagination({
		definition: userVodsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	return (
		<div className="stack md">
			<SubPageHeader user={layoutData.user} title={t("common:pages.vods")} />
			<VodListingList>
				{data.vods.map((vod) => (
					<VodListing key={vod.id} vod={vod} showUser={false} />
				))}
			</VodListingList>
			{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}
