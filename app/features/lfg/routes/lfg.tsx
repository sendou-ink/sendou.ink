import { add, sub } from "date-fns";
import { Funnel } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { AddNewButton } from "~/components/AddNewButton";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { SideNavPanel } from "~/components/SideNav";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { useSearchParamStateEncoder } from "~/hooks/useSearchParamState";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { LFG_PAGE, lfgNewPostPage, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lfg.server";
import { LFGFiltersSideNav } from "../components/LFGFiltersSideNav";
import { LFGPost } from "../components/LFGPost";
import { filterPosts } from "../core/filtering";
import { LFG } from "../lfg-constants";
import {
	countActiveFilters,
	DEFAULT_LFG_FILTERS,
	decodeFiltersState,
	encodeFiltersState,
	type LFGFiltersState,
} from "../lfg-types";
import { loader } from "../loaders/lfg.server";
import styles from "./lfg.module.css";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: ["lfg"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lfg"),
		href: LFG_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "LFG",
		ogTitle: "Splatoon LFG (looking for players, teams & coaches)",
		description:
			"Find people to play Splatoon with. Create a post or browse existing ones. For looking players, teams, scrim partners and coaches alike.",
		location: args.location,
	});
};

export type LFGLoaderData = SerializeFrom<typeof loader>;
export type LFGLoaderPost = Unpacked<LFGLoaderData["posts"]>;
export type TiersMap = ReturnType<typeof unserializeTiers>;

const unserializeTiers = (data: SerializeFrom<typeof loader>) =>
	new Map(data.tiersMap);

export default function LFGPage() {
	const { t } = useTranslation(["common", "lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [filterFromSearch, setFilterFromSearch] = useSearchParamStateEncoder({
		defaultValue: DEFAULT_LFG_FILTERS,
		name: "q",
		revive: decodeFiltersState,
		encode: encodeFiltersState,
	});
	const [filters, _setFilters] =
		React.useState<LFGFiltersState>(filterFromSearch);
	const setFilters = (x: LFGFiltersState) => {
		setFilterFromSearch(x);
		_setFilters(x);
	};

	const tiersMap = React.useMemo(() => unserializeTiers(data), [data]);

	const filteredPosts = filterPosts(data.posts, filters, tiersMap);

	const showExpiryAlert = (post: Unpacked<LFGLoaderData["posts"]>) => {
		if (post.author.id !== user?.id) return false;

		const expiryDate = add(databaseTimestampToDate(post.updatedAt), {
			days: LFG.POST_FRESHNESS_DAYS,
		});
		const expiryCloseDate = sub(expiryDate, { days: 7 });

		if (new Date() < expiryCloseDate) return false;

		return true;
	};

	const activeFilterCount = countActiveFilters(filters);

	return (
		<Main
			className="stack xl"
			sideNav={<LFGFiltersSideNav filters={filters} setFilters={setFilters} />}
		>
			<div className="stack sm horizontal justify-end">
				<SideNavPanel
					trigger={
						<SendouButton
							variant="outlined"
							size="small"
							icon={<Funnel />}
							className={styles.mobileFilterButton}
						>
							{t("lfg:filters.button")}
							{activeFilterCount > 0 ? ` (${activeFilterCount})` : null}
						</SendouButton>
					}
				>
					<LFGFiltersSideNav
						filters={filters}
						setFilters={setFilters}
						showClose
					/>
				</SideNavPanel>
				<AddNewButton navIcon="lfg" to={lfgNewPostPage()} />
			</div>
			{filteredPosts.map((post) => (
				<div key={post.id} className="stack sm">
					{showExpiryAlert(post) ? <PostExpiryAlert postId={post.id} /> : null}
					<LFGPost post={post} tiersMap={tiersMap} />
				</div>
			))}
			{filteredPosts.length === 0 ? (
				<div className="text-lighter text-lg font-semi-bold text-center mt-6">
					{t("lfg:noPosts")}
				</div>
			) : null}
		</Main>
	);
}

function PostExpiryAlert({ postId }: { postId: number }) {
	const { t } = useTranslation(["common", "lfg"]);
	const fetcher = useFetcher();

	return (
		<Alert variation="WARNING">
			<fetcher.Form method="post" className="stack md horizontal items-center">
				<input type="hidden" name="id" value={postId} />
				{t("lfg:expiring")}{" "}
				<SubmitButton _action="BUMP_POST" variant="outlined" size="small">
					{t("common:actions.clickHere")}
				</SubmitButton>
			</fetcher.Form>
		</Alert>
	);
}
