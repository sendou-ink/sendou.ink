<script lang="ts">
import type { ModeShort } from "@sendou/in-game-lists/types";
import { Download, EyeOff, MessageCircleMore, Trash, Upload } from "@lucide/svelte";
import { Button, Dialog, LinkButton, Popover } from "@sendou/components";
import { formatDistance } from "date-fns";
import ConfirmDialog from "#lib/components/ConfirmDialog.svelte";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import ModeImage from "#lib/components/ModeImage.svelte";
import TimePopover from "#lib/components/TimePopover.svelte";
import Avatar from "#lib/components/Avatar.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { m } from "#lib/paraglide/messages.js";
import type { CommonUser } from "#lib/server/kysely.ts";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { scrimPage, tournamentRegisterPage } from "#lib/utils/urls.ts";
import {
	cancelScrimRequest,
	deleteScrimPost,
	getScrimPosts,
} from "../scrims.remote.ts";
import type { ScrimPost } from "../scrims-types.ts";
import { formatFlexTimeDisplay } from "../scrims-utils.ts";
import ScrimCardShell from "./ScrimCardShell.svelte";
import ScrimExpandableText from "./ScrimExpandableText.svelte";
import ScrimRequestMembersList from "./ScrimRequestMembersList.svelte";
import ScrimRequestModal from "./ScrimRequestModal.svelte";
import ScrimTeamAvatar from "./ScrimTeamAvatar.svelte";
import ScrimTeamMembersPopover from "./ScrimTeamMembersPopover.svelte";

interface Props {
	post: ScrimPost;
	action?: "DELETE" | "REQUEST" | "VIEW_REQUEST" | "CONTACT";
	isFilteredOut?: boolean;
	autoScrollIntoView?: boolean;
	/** Cleared the pending-request highlight after the auto scroll ran. */
	onAutoScrolled?: () => void;
	/** The viewer's teams, for the request modal. */
	teams: Array<{ id: number; name: string; members: Array<CommonUser> }>;
}

let {
	post,
	action,
	isFilteredOut,
	autoScrollIntoView,
	onAutoScrolled,
	teams,
}: Props = $props();

const user = $derived(loggedInUser());

const owner = $derived(
	post.users.find((postUser) => postUser.isOwner) ?? post.users[0],
);
const isPickup = $derived(!post.team?.name);
const teamName = $derived(post.team?.name ?? owner.username);

const flexTimeDisplay = $derived(
	post.rangeEndsAt
		? formatFlexTimeDisplay(post.startsAt, post.rangeEndsAt)
		: null,
);

let isRequestModalOpen = $state(false);
let isViewRequestModalOpen = $state(false);

const userRequest = $derived(
	post.requests.find((request) =>
		request.users.some((requestUser) => user?.id === requestUser.id),
	),
);

function autoScroll(node: HTMLElement) {
	if (!autoScrollIntoView) return;

	// deferred so it runs after the router's scroll to top
	const timeout = setTimeout(() => {
		node.scrollIntoView({ behavior: "smooth", block: "center" });
		onAutoScrolled?.();
	}, 0);

	return () => clearTimeout(timeout);
}

function getModesList(maps: string): ModeShort[] {
	if (maps === "SZ") {
		return ["SZ"];
	}
	if (maps === "RANKED") {
		return ["SZ", "TC", "RM", "CB"];
	}
	return ["TW", "SZ", "TC", "RM", "CB"];
}

const timePopoverFooterText = $derived(
	m.scrims_postModal_footer({
		time: formatDistance(
			databaseTimestampToDate(post.createdAt),
			new Date(),
			{ addSuffix: true },
		),
	}),
);
</script>

<div {@attach autoScroll}>
	<ScrimCardShell
		{isPickup}
		{teamName}
		ownerUsername={owner.username}
		footerClass={isFilteredOut ? "filteredFooter" : undefined}
	>
		{#snippet avatar()}
			<ScrimTeamAvatar teamAvatarUrl={post.team?.avatarUrl} {teamName} {owner} />
		{/snippet}
		{#snippet rightIcons()}
			{#if post.isPrivate}
				<Popover>
					{#snippet trigger(triggerProps)}
						<button
							type="button"
							class="iconButton"
							data-testid="limited-visibility-popover"
							{...triggerProps}
						>
							<EyeOff class="usersIcon" />
						</button>
					{/snippet}
					{m.scrims_limitedVisibility()}
				</Popover>
			{/if}
			<ScrimTeamMembersPopover users={post.users} />
		{/snippet}

		<div class="infoRow">
			{@render infoItem("Start", startTime)}
			{#if flexTimeDisplay}
				{@render infoItem("Flex", flexText)}
			{/if}
			{#if post.divs}
				{@render infoItem("Div", divsText)}
			{/if}
			{#if post.maps || post.mapsTournament}
				{@render infoItem("Modes", modesContent)}
			{/if}
		</div>

		{#if post.text}
			<ScrimExpandableText text={post.text} />
		{/if}

		{#snippet footer()}
			{@render actionButtons()}
		{/snippet}
	</ScrimCardShell>
</div>

{#snippet infoItem(label: string, content: import("svelte").Snippet)}
	<div class="infoItem">
		<div class="infoLabel">{label}</div>
		<div class="infoValue">{@render content()}</div>
	</div>
{/snippet}

{#snippet startTime()}
	{#if !post.isScheduledForFuture}
		{#if post.canceled}
			<div class="canceledContainer">
				<span class="strikethrough">{m.scrims_now()}</span>
				<span class="canceledLabel">Canceled</span>
			</div>
		{:else}
			{m.scrims_now()}
		{/if}
	{:else if post.canceled}
		<div class="canceledContainer">
			<span class="strikethrough">
				<TimePopover
					date={databaseTimestampToDate(post.startsAt)}
					options={{ hour: "numeric", minute: "numeric" }}
					underline={false}
					footerText={timePopoverFooterText}
				/>
			</span>
			<span class="canceledLabel">Canceled</span>
		</div>
	{:else}
		<TimePopover
			date={databaseTimestampToDate(post.startsAt)}
			options={{ hour: "numeric", minute: "numeric" }}
			underline={false}
			footerText={timePopoverFooterText}
		/>
	{/if}
{/snippet}

{#snippet flexText()}
	{flexTimeDisplay}
{/snippet}

{#snippet divsText()}
	{post.divs!.max === post.divs!.min
		? post.divs!.max
		: `${post.divs!.min}-${post.divs!.max}`}
{/snippet}

{#snippet modesContent()}
	{#if post.mapsTournament}
		{@const tournament = post.mapsTournament}
		<Popover>
			{#snippet trigger(triggerProps)}
				<button
					type="button"
					class="iconButton tournamentPopoverTrigger"
					data-testid="tournament-popover-trigger"
					{...triggerProps}
				>
					<Avatar
						size="xxxsm"
						url={tournament.avatarUrl ?? undefined}
						alt={tournament.name}
					/>
				</button>
			{/snippet}
			<div class="stack sm text-center">
				<a
					href={`${tournamentRegisterPage(tournament.id)}?tab=description`}
					class="text-theme text-xxs"
				>
					{tournament.name}
				</a>
			</div>
		</Popover>
	{:else}
		{#each getModesList(post.maps!) as mode (mode)}
			<ModeImage {mode} size={18} />
		{/each}
	{/if}
{/snippet}

{#snippet actionButtons()}
	{#if action === "REQUEST"}
		<Button
			size="small"
			onclick={() => {
				isRequestModalOpen = true;
			}}
			testId="request-scrim-button"
		>
			{#snippet icon()}<Upload />{/snippet}
			{m.scrims_actions_request()}
		</Button>
		{#if isRequestModalOpen}
			<ScrimRequestModal
				{post}
				{teams}
				close={() => {
					isRequestModalOpen = false;
				}}
			/>
		{/if}
	{:else if action === "VIEW_REQUEST"}
		<Button
			size="small"
			onclick={() => {
				isViewRequestModalOpen = true;
			}}
			variant="outlined"
			testId="view-request-button"
		>
			{#snippet icon()}<Download />{/snippet}
			{m.scrims_actions_viewRequest()}
		</Button>
		{#if isViewRequestModalOpen && userRequest}
			<Dialog
				heading={m.scrims_cancelRequestModal_title()}
				onClose={() => {
					isViewRequestModalOpen = false;
				}}
			>
				<div class="stack md">
					<ScrimRequestMembersList users={userRequest.users} />
					{#if userRequest.message}
						<div>
							<div class="text-sm font-semi-bold mb-1">
								{m.scrims_requestModal_message_label()}
							</div>
							<div class="text-lighter">{userRequest.message}</div>
						</div>
					{/if}
					{#if userRequest.startsAt}
						<div>
							<div class="text-sm font-semi-bold mb-1">
								{m.scrims_requestModal_at_label()}
							</div>
							<LocaleTime
								date={userRequest.startsAt}
								options={{
									hour: "numeric",
									minute: "2-digit",
									day: "numeric",
									month: "numeric",
								}}
								class="text-lighter"
							/>
						</div>
					{/if}
					<Button
						variant="destructive"
						onclick={() =>
							cancelScrimRequest({
								scrimPostRequestId: userRequest!.id,
							}).updates(getScrimPosts)}
					>
						{#snippet icon()}<Trash />{/snippet}
						{m.common_actions_cancel()}
					</Button>
				</div>
			</Dialog>
		{/if}
	{:else if action === "CONTACT"}
		<LinkButton href={scrimPage(post.id)} size="small">
			{#snippet icon()}<MessageCircleMore />{/snippet}
			{m.scrims_actions_contact()}
		</LinkButton>
	{:else if action === "DELETE"}
		<ConfirmDialog
			dialogHeading={m.scrims_deleteModal_title()}
			submitButtonText={m.common_actions_delete()}
			onConfirm={() =>
				deleteScrimPost({ scrimPostId: post.id }).updates(getScrimPosts)}
		>
			{#snippet trigger(triggerProps)}
				<Button size="small" variant="destructive" {...triggerProps}>
					{#snippet icon()}<Trash />{/snippet}
					{m.common_actions_delete()}
				</Button>
			{/snippet}
		</ConfirmDialog>
	{/if}
{/snippet}

<style>
	.iconButton {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: var(--color-text);
		border-radius: var(--radius-field);

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.iconButton :global(.usersIcon) {
		width: 18px;
		height: 18px;
	}

	.infoRow {
		display: flex;
		gap: var(--s-6);
		padding-inline: var(--s-4);
		padding-bottom: var(--s-3);
		flex-wrap: wrap;
	}

	.infoItem {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
	}

	.infoLabel {
		text-transform: uppercase;
		color: var(--color-text-high);
		font-weight: var(--weight-bold);
		font-size: var(--font-2xs);
	}

	.infoValue {
		font-weight: var(--weight-semi);
		display: flex;
		align-items: center;
		gap: var(--s-1);
		font-size: var(--font-xs);
	}

	.tournamentPopoverTrigger {
		height: auto;
	}

	.canceledContainer {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
	}

	.strikethrough {
		text-decoration: line-through;

		& :global(button) {
			text-decoration: line-through;
		}
	}

	.canceledLabel {
		color: var(--color-error);
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		text-transform: uppercase;
	}
</style>
