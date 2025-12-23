import { useLoaderData, useMatches } from "@remix-run/react";
import { AddNewButton } from "~/components/AddNewButton";
import { VodListing } from "~/features/vods/components/VodListing";
import styles from "~/features/vods/routes/vods.module.css";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { newVodPage, userPage } from "~/utils/urls";
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
	const layoutData = parentRoute.data as UserPageLoaderData;

	return (
		<div className="stack md">
			<SubPageHeader user={layoutData.user} backTo={userPage(layoutData.user)}>
				<AddNewButton navIcon="vods" to={newVodPage()} />
			</SubPageHeader>
			<div className={styles.listingList}>
				{data.vods.map((vod) => (
					<VodListing key={vod.id} vod={vod} showUser={false} />
				))}
			</div>
		</div>
	);
}
