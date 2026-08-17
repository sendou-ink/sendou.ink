<script lang="ts">
import { Download, Funnel } from "@lucide/svelte";
import { Button } from "@sendou/components";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { m } from "#lib/paraglide/messages.js";
import type { CommonUser } from "#lib/server/kysely.ts";
import * as Scrim from "../Scrim.ts";
import type { ScrimFilters, ScrimPost } from "../scrims-types.ts";
import ScrimPostCard from "./ScrimPostCard.svelte";

interface Props {
	posts: ScrimPost[];
	filters: ScrimFilters;
	pendingRequestPostId: number | null;
	autoScrollToPostId: number | null;
	onAutoScrolled?: () => void;
	teams: Array<{ id: number; name: string; members: Array<CommonUser> }>;
}

let {
	posts,
	filters,
	pendingRequestPostId,
	autoScrollToPostId,
	onAutoScrolled,
	teams,
}: Props = $props();

const user = $derived(loggedInUser());

let showFiltered = $state(false);
// svelte-ignore state_referenced_locally -- the pending request highlight seeds the initial state only
let showRequestPending = $state(pendingRequestPostId !== null);

const filteredPosts = $derived(
	posts.filter((post) => Scrim.applyFilters(post, filters)),
);

const pendingRequestsCount = $derived(
	filteredPosts.filter((post) =>
		post.requests.some((request) =>
			request.users.some((requestUser) => user?.id === requestUser.id),
		),
	).length,
);

const filteredCount = $derived(posts.length - filteredPosts.length);

function hasRequested(post: ScrimPost) {
	return post.requests.some((request) =>
		request.users.some((requestUser) => user?.id === requestUser.id),
	);
}

function getAction(post: ScrimPost) {
	if (!user) return undefined;
	if (hasRequested(post)) return "VIEW_REQUEST" as const;
	if (post.requests.length === 0) return "REQUEST" as const;
	return undefined;
}
</script>

<div class="stack md">
	<div class="stack xxs">
		<h2 class="text-sm">
			<LocaleTime
				date={posts[0].startsAt}
				options={{
					day: "numeric",
					month: "numeric",
					weekday: "long",
				}}
			/>
		</h2>
		{#if user && (filteredCount > 0 || pendingRequestsCount > 0)}
			<div class="filterButtons">
				{#if filteredCount > 0}
					<Button
						variant="minimal"
						size="miniscule"
						onclick={() => {
							showFiltered = !showFiltered;
						}}
						class={showFiltered ? "active" : undefined}
					>
						{#snippet icon()}<Funnel />{/snippet}
						{showFiltered
							? m.scrims_filters_hideFiltered({ count: filteredCount })
							: m.scrims_filters_showFiltered({ count: filteredCount })}
					</Button>
				{/if}
				{#if pendingRequestsCount > 0}
					<Button
						variant="minimal"
						size="miniscule"
						onclick={() => {
							showRequestPending = !showRequestPending;
						}}
						class={showRequestPending ? "active" : undefined}
						testId="toggle-pending-requests-button"
					>
						{#snippet icon()}<Download />{/snippet}
						{showRequestPending
							? m.scrims_filters_hidePendingRequests({
									count: pendingRequestsCount,
								})
							: m.scrims_filters_showPendingRequests({
									count: pendingRequestsCount,
								})}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
	<div class="cardsGrid">
		{#each showFiltered ? posts : filteredPosts as post (post.id)}
			{#if !(hasRequested(post) && !showRequestPending)}
				<ScrimPostCard
					{post}
					action={getAction(post)}
					isFilteredOut={showFiltered && !Scrim.applyFilters(post, filters)}
					autoScrollIntoView={post.id === autoScrollToPostId}
					{onAutoScrolled}
					{teams}
				/>
			{/if}
		{/each}
	</div>
</div>

<style>
	.cardsGrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--s-4);
	}

	.filterButtons {
		display: flex;
		gap: var(--s-6);
		align-items: center;

		& :global(button:not(.active)) {
			color: var(--color-text-high);
		}
	}
</style>
