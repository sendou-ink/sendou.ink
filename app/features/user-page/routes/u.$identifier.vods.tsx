import { useLoaderData, useMatches } from "react-router";
import { Pagination } from "~/components/Pagination";
import { VodListing } from "~/features/vods/components/VodListing";
import styles from "~/features/vods/routes/vods.module.css";
import { userVodsSearchParams } from "~/features/vods/vods-search-params";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { SubPageHeader } from "../components/SubPageHeader";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { loader } from "../loaders/u.$identifier.vods.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
};

export default function UserVodsPage() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const data = useLoaderData<typeof loader>();
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	const pagination = useSearchParamPagination({
		definition: userVodsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	return (
		<div className="stack md">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			<div className={styles.listingList}>
				{data.vods.map((vod) => (
					<VodListing key={vod.id} vod={vod} showUser={false} />
				))}
			</div>
			{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}
