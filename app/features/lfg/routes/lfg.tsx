import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { add, sub } from "date-fns";
import React from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { useSearchParamStateEncoder } from "~/hooks/useSearchParamState";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import type { Unpacked } from "~/utils/types";
import { LFG_PAGE, navIconUrl } from "~/utils/urls";
import { LFGAddFilterButton } from "../components/LFGAddFilterButton";
import { LFGFilters } from "../components/LFGFilters";
import { LFGPost } from "../components/LFGPost";
import { filterPosts } from "../core/filtering";
import { LFG } from "../lfg-constants";
import {
	type LFGFilter,
	filterToSmallStr,
	smallStrToFilter,
} from "../lfg-types";

import { action } from "../actions/lfg.server";
import { loader } from "../loaders/lfg.server";
export { loader, action };

import "../lfg.css";

export const handle: SendouRouteHandle = {
	i18n: ["lfg"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lfg"),
		href: LFG_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = () => {
	return [{ title: makeTitle("Looking for group") }];
};

export type LFGLoaderData = SerializeFrom<typeof loader>;
export type LFGLoaderPost = Unpacked<LFGLoaderData["posts"]>;
export type TiersMap = ReturnType<typeof unserializeTiers>;

const unserializeTiers = (data: SerializeFrom<typeof loader>) =>
	new Map(data.tiersMap);

function decodeURLQuery(queryString: string): LFGFilter[] {
	if (queryString === "") {
		return [];
	}
	return queryString
		.split("-")
		.map(smallStrToFilter)
		.filter((x) => x !== null);
}

function encodeURLQuery(filters: LFGFilter[]): string {
	return filters.map(filterToSmallStr).join("-");
}

export default function LFGPage() {
	const { t } = useTranslation(["common", "lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [filterFromSearch, setTilterFromSearch] = useSearchParamStateEncoder({
		defaultValue: [],
		name: "q",
		revive: decodeURLQuery,
		encode: encodeURLQuery,
	});
	const [filters, _setFilters] = React.useState<LFGFilter[]>(filterFromSearch);
	const setFilters = (x: LFGFilter[]) => {
		setTilterFromSearch(x);
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

	return (
		<Main className="stack xl">
			<div className="stack horizontal justify-end">
				<LFGAddFilterButton
					addFilter={(newFilter) => setFilters([...filters, newFilter])}
					filters={filters}
				/>
			</div>
			<LFGFilters
				filters={filters}
				changeFilter={(newFilter) =>
					setFilters(
						filters.map((filter) =>
							filter._tag === newFilter._tag ? newFilter : filter,
						),
					)
				}
				removeFilterByTag={(tag) =>
					setFilters(filters.filter((filter) => filter._tag !== tag))
				}
			/>
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
				<SubmitButton _action="BUMP_POST" variant="outlined" size="tiny">
					{t("common:actions.clickHere")}
				</SubmitButton>
			</fetcher.Form>
		</Alert>
	);
}
