import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import { ArtGrid } from "~/features/art/components/ArtGrid";
import { useSearchParam } from "~/modules/search-params/hooks";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { action } from "../actions/u.$identifier.art.server";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.art.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { userArtSearchParams } from "../user-page-search-params";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["art"],
};

const ALL_TAGS_KEY = "ALL";
export default function UserArtPage() {
	const { t } = useTranslation(["art"]);
	const data = useLoaderData<typeof loader>();
	const [type, setType] = useSearchParam(userArtSearchParams, "source");
	const [tagParam, setFilteredTag] = useSearchParam(userArtSearchParams, "tag");
	const filteredTag =
		data.tagCounts?.find((tagCount) => tagCount[0] === tagParam)?.[0] ?? null;
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	const hasBothArtMadeByAndMadeOf =
		data.arts.some((a) => a.author) && data.arts.some((a) => !a.author);

	let arts =
		type === "ALL" || !hasBothArtMadeByAndMadeOf
			? data.arts
			: type === "MADE-BY"
				? data.arts.filter((a) => !a.author)
				: data.arts.filter((a) => a.author);

	if (filteredTag) {
		arts = arts.filter((a) => a.tags?.some((tag) => tag.name === filteredTag));
	}

	return (
		<div className="stack md">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			<div className="stack horizontal justify-between items-start text-xs text-lighter">
				<div>
					{data.unvalidatedArtCount > 0
						? t("art:pendingApproval", { count: data.unvalidatedArtCount })
						: null}
				</div>
			</div>

			{hasBothArtMadeByAndMadeOf || data.tagCounts ? (
				<div className="stack md horizontal items-center flex-wrap">
					{data.tagCounts ? (
						<select
							value={filteredTag ?? ALL_TAGS_KEY}
							onChange={(e) =>
								setFilteredTag(
									e.target.value === ALL_TAGS_KEY ? null : e.target.value,
								)
							}
							className="w-max"
						>
							<option value={ALL_TAGS_KEY}>
								{t("art:radios.all")} ({data.arts.length})
							</option>
							{data.tagCounts.map(([tag, count]) => (
								<option key={tag} value={tag}>
									#{tag} ({count})
								</option>
							))}
						</select>
					) : null}
					{hasBothArtMadeByAndMadeOf ? (
						<div className="stack md horizontal">
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="all"
									checked={type === "ALL"}
									onChange={() => setType("ALL")}
								/>
								<label htmlFor="all" className="mb-0">
									{t("art:radios.all")}
								</label>
							</div>
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="made-by"
									checked={type === "MADE-BY"}
									onChange={() => setType("MADE-BY")}
								/>
								<label htmlFor="made-by" className="mb-0">
									{t("art:radios.madeBy")}
								</label>
							</div>
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="made-of"
									checked={type === "MADE-OF"}
									onChange={() => setType("MADE-OF")}
								/>
								<label htmlFor="made-of" className="mb-0">
									{t("art:radios.madeFor")}
								</label>
							</div>
						</div>
					) : null}
				</div>
			) : null}

			{layoutData.user.commissionsOpen || layoutData.user.commissionText ? (
				<div className="whitespace-pre-wrap">
					{layoutData.user.commissionsOpen ? (
						<span className="art__comms-header">
							{t("art:commissionsOpen")} {">>>"}
						</span>
					) : (
						<span className="art__comms-header text-lighter">
							{t("art:commissionsClosed")} {">>>"}
						</span>
					)}{" "}
					{layoutData.user.commissionText}
				</div>
			) : null}

			<ArtGrid arts={arts} enablePreview />
		</div>
	);
}
