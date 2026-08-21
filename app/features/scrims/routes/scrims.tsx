import { format } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { LocaleTime } from "~/components/LocaleTime";
import { associationsPage } from "~/features/associations/associations-urls";
import { useUser } from "~/features/auth/core/user";
import { DualSelectFormField } from "~/form/fields/DualSelectFormField";
import { TimeRangeFormField } from "~/form/fields/TimeRangeFormField";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useHydrated } from "~/hooks/useHydrated";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { timeString } from "~/utils/schema";
import { navIconUrl, scrimsPage } from "~/utils/urls";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "../../../components/elements/Tabs";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.server";
import { ScrimPostCard, ScrimRequestCard } from "../components/ScrimCard";
import * as Scrim from "../core/Scrim";
import { loader } from "../loaders/scrims.server";
import { LUTI_DIVS } from "../scrims-constants";
import { type newRequestSchema, scrimsActionSchema } from "../scrims-schemas";
import { scrimsSearchParams } from "../scrims-search-params";
import type { LutiDiv, ScrimFilters, ScrimPost } from "../scrims-types";

export { action, loader };

import { Check, Download, Funnel, Megaphone, Star } from "lucide-react";

import styles from "./scrims.module.css";

export type NewRequestFormFields = v.InferOutput<typeof newRequestSchema>;

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "scrims", "user", "q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("scrims"),
		href: scrimsPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction<typeof loader> = (args) => {
	return metaTags({
		title: "Scrims",
		ogTitle: "Splatoon scrim finder",
		description:
			"Schedule scrims against competitive teams. Make your own post or browse available scrims.",
		location: args.location,
	});
};

export default function ScrimsPage() {
	const user = useUser();
	const { t } = useTranslation(["calendar", "scrims"]);
	const data = useLoaderData<typeof loader>();
	const isHydrated = useHydrated();
	const [autoScrollToPostId] = useSearchParam(
		scrimsSearchParams,
		"pendingRequestPostId",
	);

	// kept in state because the search param is cleared after the auto scroll
	const [pendingRequestPostId, setPendingRequestPostId] =
		React.useState(autoScrollToPostId);
	if (
		autoScrollToPostId !== null &&
		autoScrollToPostId !== pendingRequestPostId
	) {
		setPendingRequestPostId(autoScrollToPostId);
	}

	if (!isHydrated)
		return (
			<Main>
				<div className={styles.placeholder} />
			</Main>
		);

	return (
		<Main className="stack lg">
			{user ? (
				<div className="stack horizontal sm items-center flex-wrap">
					<LinkButton size="small" to={associationsPage()} variant="outlined">
						{t("scrims:associations.title")}
					</LinkButton>
					<Filters />
				</div>
			) : null}
			<SendouTabs
				key={pendingRequestPostId}
				defaultSelectedKey={
					pendingRequestPostId !== null
						? "available"
						: data.posts.owned.length > 0
							? "owned"
							: data.posts.booked.length > 0
								? "booked"
								: "available"
				}
			>
				{user ? (
					<SendouTabList sticky>
						<SendouTab
							id="available"
							icon={<Megaphone />}
							number={data.posts.neutral.length}
							data-testid="available-scrims-tab"
						>
							{t("scrims:tabs.available")}
						</SendouTab>
						<SendouTab
							id="owned"
							isDisabled={!user}
							icon={<Download />}
							number={data.posts.owned.length}
						>
							{t("scrims:tabs.owned")}
						</SendouTab>
						<SendouTab
							id="booked"
							isDisabled={!user}
							icon={<Check />}
							number={data.posts.booked.length}
							data-testid="booked-scrims-tab"
						>
							{t("scrims:tabs.booked")}
						</SendouTab>
					</SendouTabList>
				) : null}
				<SendouTabPanel id="available">
					{data.posts.neutral.length > 0 ? (
						<ScrimsDaySeparatedCards
							posts={data.posts.neutral}
							filters={data.filters}
							pendingRequestPostId={pendingRequestPostId}
							autoScrollToPostId={autoScrollToPostId}
						/>
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noneAvailable")}
						</div>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="owned">
					{data.posts.owned.length > 0 ? (
						<ScrimsDaySeparatedOwnedCards posts={data.posts.owned} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noOwnedPosts")}
						</div>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="booked">
					{data.posts.booked.length > 0 ? (
						<ScrimsDaySeparatedBookedCards posts={data.posts.booked} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noBookedScrims")}
						</div>
					)}
				</SendouTabPanel>
			</SendouTabs>
			<div className="mt-6 text-xs text-center text-lighter">
				{t("calendar:inYourTimeZone")}{" "}
				{Intl.DateTimeFormat().resolvedOptions().timeZone}
			</div>
		</Main>
	);
}

function Filters() {
	const { t } = useTranslation(["scrims", "forms", "common"]);
	const data = useLoaderData<typeof loader>();
	const [, setParams] = useSearchParamsTyped(scrimsSearchParams);
	const persistFilters = useActionSubmit(scrimsActionSchema, {
		encType: "application/json",
	});

	const filters = data.filters;

	const writeFilters = (partial: Partial<ScrimFilters>) => {
		setParams({ ...filters, ...partial, useDefaults: false });
	};

	return (
		<FilterBar
			pills={[
				{
					key: "weekdayTimes",
					name: t("scrims:filters.weekdayTimes"),
					formattedValue: filters.weekdayTimes
						? `${filters.weekdayTimes.start}–${filters.weekdayTimes.end}`
						: null,
					onRemove: () => writeFilters({ weekdayTimes: null }),
					testId: "weekday-times-filter",
					popover: (
						<TimeRangePopover
							name="weekdayTimes"
							value={filters.weekdayTimes}
							onChange={(timeRange) =>
								writeFilters({ weekdayTimes: timeRange })
							}
						/>
					),
				},
				{
					key: "weekendTimes",
					name: t("scrims:filters.weekendTimes"),
					formattedValue: filters.weekendTimes
						? `${filters.weekendTimes.start}–${filters.weekendTimes.end}`
						: null,
					onRemove: () => writeFilters({ weekendTimes: null }),
					testId: "weekend-times-filter",
					popover: (
						<TimeRangePopover
							name="weekendTimes"
							value={filters.weekendTimes}
							onChange={(timeRange) =>
								writeFilters({ weekendTimes: timeRange })
							}
						/>
					),
				},
				{
					key: "divs",
					name: t("scrims:filters.divs"),
					formattedValue: filters.divs
						? `${filters.divs.max}–${filters.divs.min}`
						: null,
					onRemove: () => writeFilters({ divs: null }),
					testId: "divs-filter",
					popover: (
						<DivsPopover
							value={filters.divs}
							onChange={(divs) => writeFilters({ divs })}
						/>
					),
				},
			]}
			onReset={
				!Scrim.filtersAreDefault(filters)
					? () =>
							writeFilters({
								weekdayTimes: null,
								weekendTimes: null,
								divs: null,
							})
					: undefined
			}
			actions={
				data.canSaveAsDefault ? (
					<SendouButton
						icon={<Star />}
						isDisabled={persistFilters.state !== "idle"}
						onPress={() =>
							persistFilters.submit("PERSIST_SCRIM_FILTERS", { filters })
						}
						data-testid="save-filters-as-default-button"
					>
						{t("common:filterBar.saveAsDefault")}
					</SendouButton>
				) : null
			}
		/>
	);
}

function TimeRangePopover({
	name,
	value,
	onChange,
}: {
	name: string;
	value: ScrimFilters["weekdayTimes"];
	onChange: (value: ScrimFilters["weekdayTimes"]) => void;
}) {
	const { t } = useTranslation(["forms"]);
	const [draft, setDraft] = React.useState(value);

	const handleChange = (timeRange: { start: string; end: string } | null) => {
		setDraft(timeRange);

		if (timeRange === null) {
			onChange(null);
			return;
		}

		if (
			v.safeParse(timeString, timeRange.start).success &&
			v.safeParse(timeString, timeRange.end).success
		) {
			onChange(timeRange);
		}
	};

	return (
		<TimeRangeFormField
			name={name}
			value={draft}
			onChange={handleChange}
			startLabel={t("forms:labels.start")}
			endLabel={t("forms:labels.end")}
		/>
	);
}

function DivsPopover({
	value,
	onChange,
}: {
	value: ScrimFilters["divs"];
	onChange: (value: ScrimFilters["divs"]) => void;
}) {
	const { t } = useTranslation(["forms"]);
	const [draft, setDraft] = React.useState<[LutiDiv | null, LutiDiv | null]>([
		value?.max ?? null,
		value?.min ?? null,
	]);

	const divItems = LUTI_DIVS.map((div) => ({ label: div, value: div }));

	const handleChange = (newValue: [LutiDiv | null, LutiDiv | null]) => {
		setDraft(newValue);

		const [max, min] = newValue;
		if (max !== null && min !== null) {
			onChange({ max, min });
		} else if (max === null && min === null) {
			onChange(null);
		}
	};

	return (
		<DualSelectFormField
			name="divs"
			fields={[
				{ label: t("forms:labels.scrimMaxDiv"), items: divItems },
				{ label: t("forms:labels.scrimMinDiv"), items: divItems },
			]}
			value={draft}
			onChange={handleChange}
			onBlur={() => {}}
		/>
	);
}

function ScrimsDaySeparatedCards({
	posts,
	filters,
	pendingRequestPostId,
	autoScrollToPostId,
}: {
	posts: ScrimPost[];
	filters: ScrimFilters;
	pendingRequestPostId: number | null;
	autoScrollToPostId: number | null;
}) {
	const postsByDay = R.groupBy(posts, (post) =>
		format(databaseTimestampToDate(post.startsAt), "yyyy-MM-dd"),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([day, dayPosts]) => (
					<ScrimsDaySection
						key={day}
						posts={dayPosts!}
						filters={filters}
						pendingRequestPostId={pendingRequestPostId}
						autoScrollToPostId={autoScrollToPostId}
					/>
				))}
		</div>
	);
}

function ScrimsDaySection({
	posts,
	filters,
	pendingRequestPostId,
	autoScrollToPostId,
}: {
	posts: ScrimPost[];
	filters: ScrimFilters;
	pendingRequestPostId: number | null;
	autoScrollToPostId: number | null;
}) {
	const user = useUser();
	const [showFiltered, setShowFiltered] = React.useState(false);
	const [showRequestPending, setShowRequestPending] = React.useState(
		pendingRequestPostId !== null,
	);

	const filteredPosts = posts.filter((post) =>
		Scrim.applyFilters(post, filters),
	);

	const pendingRequestsCount = filteredPosts.filter((post) =>
		post.requests.some((request) =>
			request.users.some((rUser) => user?.id === rUser.id),
		),
	).length;

	return (
		<div className="stack md">
			<div className="stack xxs">
				<h2 className="text-sm">
					<LocaleTime
						date={posts[0].startsAt}
						options={{
							day: "numeric",
							month: "numeric",
							weekday: "long",
						}}
					/>
				</h2>
				{user ? (
					<AvailableScrimsFilterButtons
						showFiltered={showFiltered}
						setShowFiltered={setShowFiltered}
						showRequestPending={showRequestPending}
						setShowRequestPending={setShowRequestPending}
						pendingRequestsCount={pendingRequestsCount}
						filteredCount={posts.length - filteredPosts.length}
					/>
				) : null}
			</div>
			<div className={styles.cardsGrid}>
				{(showFiltered ? posts : filteredPosts).map((post) => {
					const hasRequested = post.requests.some((request) =>
						request.users.some((rUser) => user?.id === rUser.id),
					);

					if (hasRequested && !showRequestPending) {
						return null;
					}

					const getAction = () => {
						if (!user) return undefined;
						if (hasRequested) return "VIEW_REQUEST";
						if (post.requests.length === 0) return "REQUEST";
						return undefined;
					};

					const isFilteredOut =
						showFiltered && !Scrim.applyFilters(post, filters);

					return (
						<ScrimPostCard
							key={post.id}
							post={post}
							action={getAction()}
							isFilteredOut={isFilteredOut}
							autoScrollIntoView={post.id === autoScrollToPostId}
						/>
					);
				})}
			</div>
		</div>
	);
}

function AvailableScrimsFilterButtons({
	showFiltered,
	setShowFiltered,
	showRequestPending,
	setShowRequestPending,
	pendingRequestsCount,
	filteredCount,
}: {
	showFiltered: boolean;
	setShowFiltered: (value: boolean) => void;
	showRequestPending: boolean;
	setShowRequestPending: (value: boolean) => void;
	pendingRequestsCount: number;
	filteredCount: number;
}) {
	const { t } = useTranslation(["scrims"]);

	if (filteredCount === 0 && pendingRequestsCount === 0) {
		return null;
	}

	return (
		<div className={styles.filterButtons}>
			{filteredCount > 0 ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={() => setShowFiltered(!showFiltered)}
					icon={<Funnel />}
					className={showFiltered ? styles.active : undefined}
				>
					{showFiltered
						? t("scrims:filters.hideFiltered", { count: filteredCount })
						: t("scrims:filters.showFiltered", { count: filteredCount })}
				</SendouButton>
			) : null}
			{pendingRequestsCount > 0 ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={() => setShowRequestPending(!showRequestPending)}
					icon={<Download />}
					className={showRequestPending ? styles.active : undefined}
					data-testid="toggle-pending-requests-button"
				>
					{showRequestPending
						? t("scrims:filters.hidePendingRequests", {
								count: pendingRequestsCount,
							})
						: t("scrims:filters.showPendingRequests", {
								count: pendingRequestsCount,
							})}
				</SendouButton>
			) : null}
		</div>
	);
}

function ScrimsDaySeparatedOwnedCards({ posts }: { posts: ScrimPost[] }) {
	const { t } = useTranslation(["scrims"]);
	const user = useUser();

	const postsByDay = R.groupBy(posts, (post) =>
		format(databaseTimestampToDate(post.startsAt), "yyyy-MM-dd"),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([day, posts]) => {
					return (
						<div key={day} className="stack md">
							<h2 className="text-sm">
								<LocaleTime
									date={posts![0].startsAt}
									options={{
										day: "numeric",
										month: "numeric",
										weekday: "long",
									}}
								/>
							</h2>
							<div className="stack lg">
								{posts!.map((post) => {
									const isAccepted = post.requests.some(
										(request) => request.isAccepted,
									);
									const canDelete =
										user &&
										post.permissions.DELETE_POST.includes(user.id) &&
										!isAccepted;

									return (
										<div key={post.id} className="stack sm">
											<ScrimPostCard
												post={post}
												action={canDelete ? "DELETE" : undefined}
											/>
											{post.requests.length > 0 ? (
												<div className="stack sm">
													{post.requests.map((request) => (
														<ScrimRequestCard
															key={request.id}
															request={request}
															postStartTime={post.startsAt}
															canAccept={Boolean(
																user &&
																	post.permissions.MANAGE_REQUESTS.includes(
																		user.id,
																	),
															)}
														/>
													))}
												</div>
											) : (
												<div className="text-lighter text-lg font-bold mt-2 text-center">
													{t("scrims:noRequestsYet")}
												</div>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
		</div>
	);
}

function ScrimsDaySeparatedBookedCards({ posts }: { posts: ScrimPost[] }) {
	const postsByDay = R.groupBy(posts, (post) =>
		format(databaseTimestampToDate(post.startsAt), "yyyy-MM-dd"),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([day, posts]) => {
					return (
						<div key={day} className="stack md">
							<h2 className="text-sm">
								<LocaleTime
									date={posts![0].startsAt}
									options={{
										day: "numeric",
										month: "numeric",
										weekday: "long",
									}}
								/>
							</h2>
							<div className="stack lg">
								{posts!.map((post) => {
									const acceptedRequest = post.requests.find(
										(request) => request.isAccepted,
									);

									return (
										<div key={post.id} className="stack sm">
											<ScrimPostCard post={post} action="CONTACT" />
											{acceptedRequest ? (
												<ScrimRequestCard
													request={acceptedRequest}
													postStartTime={post.startsAt}
													canAccept={false}
													showFooter={false}
												/>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
		</div>
	);
}
