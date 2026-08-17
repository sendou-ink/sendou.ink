<script lang="ts">
import { Check, Download, Megaphone } from "@lucide/svelte";
import { LinkButton, Tab, TabList, TabPanel, Tabs } from "@sendou/components";
import { format } from "date-fns";
import * as R from "remeda";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import Main from "#lib/components/Main.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { setUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import { searchParamsState } from "#lib/modules/search-params/search-params-state.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { associationsPage } from "#lib/utils/urls.ts";
import { getScrimPosts } from "../scrims.remote.ts";
import { scrimsSearchParams } from "../scrims-search-params.ts";
import type { ScrimFilters, ScrimPost } from "../scrims-types.ts";
import ScrimPostCard from "./ScrimPostCard.svelte";
import ScrimRequestCard from "./ScrimRequestCard.svelte";
import ScrimsDaySection from "./ScrimsDaySection.svelte";
import ScrimsFilters from "./ScrimsFilters.svelte";

const user = $derived(loggedInUser());

const params = searchParamsState(scrimsSearchParams);

const data = $derived(
	await getScrimPosts({
		weekdayTimes: params.current.weekdayTimes,
		weekendTimes: params.current.weekendTimes,
		divs: params.current.divs,
		useDefaults: params.current.useDefaults,
	}),
);

setUserCardContext({
	userCards: () => data.userCards,
});

const autoScrollToPostId = $derived(params.current.pendingRequestPostId);

// kept in state because the search param is cleared after the auto scroll
let pendingRequestPostId = $state<number | null>(null);
$effect(() => {
	if (autoScrollToPostId !== null) {
		pendingRequestPostId = autoScrollToPostId;
	}
});

function writeFilters(partial: Partial<ScrimFilters>) {
	params.set({ ...data.filters, ...partial, useDefaults: false });
}

function postsByDay(posts: ScrimPost[]) {
	return Object.entries(
		R.groupBy(posts, (post) =>
			format(databaseTimestampToDate(post.startsAt), "yyyy-MM-dd"),
		),
	).sort(([a], [b]) => a.localeCompare(b));
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
</script>

<Main>
	<div class="stack lg">
		<div class="stack horizontal sm items-center flex-wrap">
			<LinkButton
				size="small"
				href={associationsPage()}
				class={!user ? "invisible" : undefined}
				variant="outlined"
			>
				{m.scrims_associations_title()}
			</LinkButton>
			<ScrimsFilters
				filters={data.filters}
				canSaveAsDefault={data.canSaveAsDefault}
				{writeFilters}
			/>
		</div>
		{#key pendingRequestPostId}
			<Tabs
				defaultSelectedKey={pendingRequestPostId !== null
					? "available"
					: data.posts.owned.length > 0
						? "owned"
						: data.posts.booked.length > 0
							? "booked"
							: "available"}
			>
				{#if user}
					<TabList sticky>
						<Tab id="available" number={data.posts.neutral.length}>
							{#snippet icon()}<Megaphone />{/snippet}
							{m.scrims_tabs_available()}
						</Tab>
						<Tab id="owned" number={data.posts.owned.length}>
							{#snippet icon()}<Download />{/snippet}
							{m.scrims_tabs_owned()}
						</Tab>
						<Tab id="booked" number={data.posts.booked.length}>
							{#snippet icon()}<Check />{/snippet}
							{m.scrims_tabs_booked()}
						</Tab>
					</TabList>
				{/if}
				<TabPanel id="available">
					{#if data.posts.neutral.length > 0}
						<div class="stack lg">
							{#each postsByDay(data.posts.neutral) as [day, dayPosts] (day)}
								<ScrimsDaySection
									posts={dayPosts}
									filters={data.filters}
									{pendingRequestPostId}
									{autoScrollToPostId}
									onAutoScrolled={() =>
										params.set({ pendingRequestPostId: null })}
									teams={data.teams}
								/>
							{/each}
						</div>
					{:else}
						<div class="text-lighter text-lg font-semi-bold text-center mt-6">
							{m.scrims_noneAvailable()}
						</div>
					{/if}
				</TabPanel>
				<TabPanel id="owned">
					{#if data.posts.owned.length > 0}
						<div class="stack lg">
							{#each postsByDay(data.posts.owned) as [day, dayPosts] (day)}
								<div class="stack md">
									<h2 class="text-sm">
										<LocaleTime
											date={dayPosts[0].startsAt}
											options={{
												day: "numeric",
												month: "numeric",
												weekday: "long",
											}}
										/>
									</h2>
									<div class="stack lg">
										{#each dayPosts as post (post.id)}
											{@const isAccepted = post.requests.some(
												(request) => request.isAccepted,
											)}
											{@const canDelete =
												user &&
												post.permissions.DELETE_POST.includes(user.id) &&
												!isAccepted}
											<div class="stack sm">
												<ScrimPostCard
													{post}
													action={canDelete ? "DELETE" : undefined}
													teams={data.teams}
												/>
												{#if post.requests.length > 0}
													<div class="stack sm">
														{#each post.requests as request (request.id)}
															<ScrimRequestCard
																{request}
																postStartTime={post.startsAt}
																canAccept={Boolean(
																	user &&
																		post.permissions.MANAGE_REQUESTS.includes(
																			user.id,
																		),
																)}
															/>
														{/each}
													</div>
												{:else}
													<div
														class="text-lighter text-lg font-bold mt-2 text-center"
													>
														{m.scrims_noRequestsYet()}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-lighter text-lg font-semi-bold text-center mt-6">
							{m.scrims_noOwnedPosts()}
						</div>
					{/if}
				</TabPanel>
				<TabPanel id="booked">
					{#if data.posts.booked.length > 0}
						<div class="stack lg">
							{#each postsByDay(data.posts.booked) as [day, dayPosts] (day)}
								<div class="stack md">
									<h2 class="text-sm">
										<LocaleTime
											date={dayPosts[0].startsAt}
											options={{
												day: "numeric",
												month: "numeric",
												weekday: "long",
											}}
										/>
									</h2>
									<div class="stack lg">
										{#each dayPosts as post (post.id)}
											{@const acceptedRequest = post.requests.find(
												(request) => request.isAccepted,
											)}
											<div class="stack sm">
												<ScrimPostCard
													{post}
													action="CONTACT"
													teams={data.teams}
												/>
												{#if acceptedRequest}
													<ScrimRequestCard
														request={acceptedRequest}
														postStartTime={post.startsAt}
														canAccept={false}
														showFooter={false}
													/>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-lighter text-lg font-semi-bold text-center mt-6">
							{m.scrims_noBookedScrims()}
						</div>
					{/if}
				</TabPanel>
			</Tabs>
		{/key}
		<div class="mt-6 text-xs text-center text-lighter">
			{m.calendar_inYourTimeZone()}
			{timeZone}
		</div>
	</div>
</Main>
