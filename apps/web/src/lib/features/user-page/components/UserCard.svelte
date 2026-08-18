<script lang="ts">
import {
	BadgeCheck,
	Flag,
	Megaphone,
	NotebookPen,
	NotebookText,
	Pencil,
	Trash2,
	UserPlus,
	UserRoundCheck,
	VenetianMask,
} from "@lucide/svelte";
import { Button, LinkButton, Popover } from "@sendou/components";
import type { BrandId } from "@sendou/in-game-lists/types";
import { assertUnreachable } from "@sendou/utils/types";
import type { Snippet } from "svelte";
import Avatar from "#lib/components/Avatar.svelte";
import Image from "#lib/components/Image.svelte";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import Placement from "#lib/components/Placement.svelte";
import TierImage from "#lib/components/TierImage.svelte";
import type { XRankPlacementRegion } from "#lib/db/tables-json.ts";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import type {
	UserCardData,
	UserCardFriendship,
	UserCardStat,
} from "#lib/features/user-page/user-card-types.ts";
import {
	getUserCard,
	getUserCardFriendship,
} from "#lib/features/user-page/user-card.remote.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	brandImageUrl,
	impersonateUrl,
	lfgPostPage,
	navIconUrl,
	stageBannerImageUrl,
	userCardEditPage,
	userPage,
} from "#lib/utils/urls.ts";
import { dev } from "$app/env";
import { page } from "$app/state";
import MutualFriends from "./MutualFriends.svelte";

const TENTATEK_BRAND_ID: BrandId = "B10";

const STAT_ORDER: Record<UserCardStat["type"], number> = {
	XP: 0,
	SEASON: 1,
	PLUS: 2,
	DIV: 3,
};

interface Props {
	userId: number;
	/** Ask for the user's friend code; the server only sends it to viewers entitled to it. */
	withFriendCode?: boolean;
	/** Fetch and show the mutual friends row. Off by default. */
	withMutualFriends?: boolean;
	children: Snippet<[UserCardData | undefined]>;
}

let {
	userId,
	withFriendCode = false,
	withMutualFriends = false,
	children,
}: Props = $props();

const data = $derived(await getUserCard({ userId, withFriendCode }));

const isOwnCard = $derived(loggedInUser()?.id === userId);
const returnTo = $derived(`${page.url.pathname}${page.url.search}`);

const stats = $derived(
	data
		? data.stats.toSorted((a, b) => STAT_ORDER[a.type] - STAT_ORDER[b.type])
		: [],
);

let isOpen = $state(false);
// an existing note shows in-place (toggled); with no note the button opens the add modal directly
let isNoteOpen = $state(false);

let friendship = $state<UserCardFriendship | undefined>();
let friendshipRequested = false;

const showNoteView = $derived(isNoteOpen && data?.privateNote != null);

function handleOpenChange(nextIsOpen: boolean) {
	isOpen = nextIsOpen;

	if (!nextIsOpen) return;
	if (friendshipRequested) return;
	if (isOwnCard) return;

	// xxx: do this properly
	friendshipRequested = true;
	getUserCardFriendship({ userId, withMutualFriends })
		.then((result) => {
			friendship = result;
		})
		.catch(() => {
			// on failure the card just renders without the viewer-relative rows
		});
}

function onNoteButtonPress() {
	if (!data) return;
	if (data.privateNote === null) {
		// xxx: AddPrivateNoteDialog is not ported yet (depends on the unported SendouForm/dialog system)
		return;
	}
	isNoteOpen = !isNoteOpen;
}

function onEditNotePress() {
	// xxx: AddPrivateNoteDialog is not ported yet (depends on the unported SendouForm/dialog system)
}

function onDeleteNotePress() {
	// xxx: delete-note confirm dialog (FormWithConfirm) + the private note write path are not ported yet
}

function onReportPress() {
	// xxx: ReportUserDialog (user-report feature) is not ported yet
}

function onFriendRequestPress() {
	// xxx: friend request send/accept (the /friends write path + success toasts) is not ported yet
}

function bannerStyle(banner: UserCardData["banner"]) {
	switch (banner.type) {
		case "STAGE":
			return `background-image: url(${stageBannerImageUrl(banner.stageId)})`;
		case "URL":
			return `background-image: url(${banner.url})`;
		case "COLOR":
			return `background-color: ${banner.hexCode}`;
		default:
			return assertUnreachable(banner);
	}
}

function customThemeStyle(customTheme: UserCardData["customTheme"]) {
	if (!customTheme) return undefined;

	return Object.entries(customTheme)
		.filter(
			([key, value]) =>
				value !== null && !key.includes("--_size") && !key.includes("--_border"),
		)
		.map(([key, value]) => `${key}: ${value}`)
		.join("; ");
}
</script>

<!--
@component
Click-to-open trigger that shows a popover with the user's card. Card data is loaded by the card
itself through the batched `getUserCard` query.

Viewer-relative friendship data (`isFriend`) is lazy-loaded via the `getUserCardFriendship` remote
query the first time the card opens. Mutual friends are only fetched and shown when
`withMutualFriends` is set (e.g. the SendouQ looking page); other views (e.g. match pages) skip
both the extra query and the row.
-->

{#snippet divImage(region: XRankPlacementRegion)}
	{#if region === "WEST"}
		<Image
			path={brandImageUrl(TENTATEK_BRAND_ID)}
			alt={m.common_divisions_WEST()}
			width={18}
			height={18}
		/>
	{/if}
{/snippet}

{#snippet statView(stat: UserCardStat)}
	{#if stat.type === "XP"}
		{@const unverified = stat.values.find((value) => !value.isVerified)}
		{@const verified = stat.values.find((value) => value.isVerified)}
		{@const primary = unverified ?? verified}
		{@const secondary = unverified ? verified : undefined}
		<span class="stat xpStat">
			{#if primary}
				<span class="xpPrimary">
					<span class="xpPrimaryIcons"
						>{#if primary.isVerified}<BadgeCheck
								class={primary.region === "WEST"
									? "xpVerifiedIconSmall"
									: "xpVerifiedIconLarge"}
							/>{/if}{@render divImage(primary.region)}</span
					>
					{primary.points}{m.user_card_xp()}
				</span>
			{/if}
			{#if secondary}
				<span class="xpVerified">
					<BadgeCheck class="xpVerifiedIconSmall" />
					{@render divImage(secondary.region)}
					{secondary.points}{m.user_card_xp()}
				</span>
			{/if}
		</span>
	{:else if stat.type === "DIV"}
		<span class="stat">Div {stat.value}</span>
	{:else if stat.type === "PLUS"}
		<span class="stat plusStat">
			<Image path={navIconUrl("plus")} alt="+" size={24} />
			{stat.value}
		</span>
	{:else if stat.type === "SEASON"}
		<span class="seasonStat">
			<TierImage tier={stat.value} width={32} />
			{#if typeof stat.top === "number"}
				<span class="seasonTop">
					<Placement
						placement={stat.top}
						size={14}
						showAsSuperscript={false}
						textOnly
					/>
				</span>
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet friendRequestButton(friendshipData: UserCardFriendship)}
	{#if friendshipData.incomingFriendRequestId !== null}
		<Button
			size="miniscule"
			shape="circle"
			aria-label="Accept friend request"
			onclick={onFriendRequestPress}
		>
			{#snippet icon()}<UserPlus />{/snippet}
		</Button>
	{:else if friendshipData.sentFriendRequest}
		<Button
			size="miniscule"
			shape="circle"
			disabled
			aria-label={m.user_card_friendRequestPending()}
		>
			{#snippet icon()}<UserRoundCheck />{/snippet}
		</Button>
	{:else}
		<Button
			size="miniscule"
			shape="circle"
			aria-label={m.user_card_sendFriendRequest()}
			onclick={onFriendRequestPress}
		>
			{#snippet icon()}<UserPlus />{/snippet}
		</Button>
	{/if}
{/snippet}

{#snippet noteView(note: NonNullable<UserCardData["privateNote"]>)}
	<div class="noteView">
		<div class="noteHeaderGroup">
			<span class="noteHeader">{m.user_card_privateNote()}</span>
			<LocaleTime
				date={note.updatedAt}
				options={{ day: "numeric", month: "numeric", year: "numeric" }}
				class="noteDate"
				inline
			/>
		</div>
		{#if note.text}
			<p class="noteText">{note.text}</p>
		{/if}
		<div class="noteViewActions">
			<Button variant="minimal" size="miniscule" onclick={onEditNotePress}>
				{#snippet icon()}<Pencil />{/snippet}
				{m.common_actions_edit()}
			</Button>
			<Button
				variant="minimal-destructive"
				size="miniscule"
				onclick={onDeleteNotePress}
			>
				{#snippet icon()}<Trash2 />{/snippet}
				{m.common_actions_delete()}
			</Button>
		</div>
	</div>
{/snippet}

{#if !data}
	{@render children(data)}
{:else}
	<Popover
		{isOpen}
		onOpenChange={handleOpenChange}
		popoverClass="userCardPopover"
	>
		{#snippet trigger(triggerProps)}
			<button type="button" class="trigger" {...triggerProps}>
				{@render children(data)}
			</button>
		{/snippet}
		<div
			class="card"
			style={customThemeStyle(data.customTheme)}
			data-custom-theme={data.customTheme ? true : undefined}
		>
			<div
				class="banner"
				style={bannerStyle(data.banner)}
				data-testid="user-card-banner"
			></div>
			{#if data.freeAgentPostId !== null}
				<LinkButton
					href={lfgPostPage(data.freeAgentPostId)}
					size="miniscule"
					class="freeAgentBadge"
				>
					{#snippet icon()}<Megaphone />{/snippet}
					{m.user_card_freeAgent()}
				</LinkButton>
			{/if}
			<div class="iconButtons">
				{#if isOwnCard}
					<LinkButton href={userCardEditPage({ returnTo })} size="miniscule">
						{#snippet icon()}<Pencil />{/snippet}
						{m.common_actions_edit()}
					</LinkButton>
				{:else}
					{#if dev}
						<form method="post" action={impersonateUrl(data.id)}>
							<input type="hidden" name="returnTo" value={returnTo} />
							<Button
								type="submit"
								size="miniscule"
								shape="circle"
								aria-label="Impersonate user"
							>
								{#snippet icon()}<VenetianMask />{/snippet}
							</Button>
						</form>
					{/if}
					{#if friendship && !friendship.isFriend}
						{@render friendRequestButton(friendship)}
					{/if}
					<Button
						size="miniscule"
						shape="circle"
						onclick={onNoteButtonPress}
						aria-label={m.user_card_editPrivateNote()}
					>
						{#snippet icon()}
							{#if data.privateNote !== null}
								<NotebookText />
							{:else}
								<NotebookPen />
							{/if}
						{/snippet}
					</Button>
					{#if loggedInUser()}
						<Button
							size="miniscule"
							shape="circle"
							onclick={onReportPress}
							aria-label="Report user"
							testId="report-user-button"
						>
							{#snippet icon()}<Flag />{/snippet}
						</Button>
					{/if}
				{/if}
			</div>
			<div class="identity">
				<NoteAvatar
					sentiment={data.privateNote?.sentiment}
					onclick={isOwnCard ? undefined : onNoteButtonPress}
				>
					<Avatar user={data} size="md" class="avatar" />
				</NoteAvatar>
				<div class="nameGroup">
					<h2 class="username">{data.username}</h2>
					{#if data.customUrl}
						<div class="subtitle">{data.customUrl}</div>
					{/if}
					{#if data.friendCode}
						<span class="friendCode">SW-{data.friendCode}</span>
					{:else}
						<!-- reserve space -->
						<span class="friendCode">{"\u{200b}"}</span>
					{/if}
				</div>
			</div>
			{#if showNoteView && data.privateNote}
				{@render noteView(data.privateNote)}
			{:else}
				{#if stats.length > 0}
					<div class="stats">
						{#each stats as stat, i (stat.type)}
							{#if i > 0}<span class="statDivider"></span>{/if}
							{@render statView(stat)}
						{/each}
					</div>
				{/if}
				{#if !isOwnCard && withMutualFriends}
					<div class="mutualFriends">
						{#if friendship !== undefined}
							{#if friendship.mutualFriends.length === 0}
								<span class="noMutualFriends"
									>{m.user_card_noMutualFriends()}</span
								>
							{:else}
								<MutualFriends mutualFriends={friendship.mutualFriends} />
							{/if}
						{/if}
					</div>
				{/if}
				{#if data.shortBio}
					<p class="bio">{data.shortBio}</p>
				{/if}
				<LinkButton
					href={userPage(data)}
					variant="outlined"
					size="small"
					class="viewUserPage"
				>
					{m.user_card_viewUserPage()}
				</LinkButton>
			{/if}
		</div>
	</Popover>
{/if}

<style>
	/* class is repeated to out-specify the base `.content` styles scoped inside Popover.svelte */
	:global(.userCardPopover.userCardPopover.userCardPopover) {
		border: none;
		background: none;
		padding: 0;
		max-width: none;
		white-space: normal;
		font-size: var(--font-sm);
		font-weight: var(--weight-body);
	}

	/* beside the trigger there is no room for the card on a narrow viewport, so it is placed
	vertically there (the base block-end position) and to the right on wider viewports */
	@media (min-width: 600px) {
		:global(.userCardPopover.userCardPopover.userCardPopover) {
			position-area: inline-end;
			position-try-fallbacks: flip-inline, block-end;
			align-self: anchor-center;
			justify-self: normal;
		}
	}

	.trigger {
		display: inline-flex;
		width: fit-content;
		padding: 0;
		margin: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: inherit;
		cursor: pointer;
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
		width: 18rem;
		max-width: calc(100vw - var(--s-4));
		padding: 0 var(--s-4) var(--s-4);
		background-color: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-box);
		overflow: hidden;

		& :global(.freeAgentBadge) {
			position: absolute;
			top: var(--s-2);
			inset-inline-start: var(--s-2);
		}

		& :global(.viewUserPage) {
			margin-top: var(--s-1);
			align-self: center;
		}

		& :global(.xpVerifiedIconSmall) {
			width: var(--s-4);
			height: var(--s-4);
			color: var(--color-success);
		}

		& :global(.xpVerifiedIconLarge) {
			width: var(--s-5);
			height: var(--s-5);
			color: var(--color-success);
		}
	}

	.banner {
		height: 6rem;
		margin-inline: calc(-1 * var(--s-4));
		background-size: cover;
		background-position: center;
		background-color: var(--color-bg-higher);
	}

	.iconButtons {
		position: absolute;
		top: var(--s-2);
		inset-inline-end: var(--s-2);
		display: flex;
		gap: var(--s-2);
	}

	.identity {
		display: flex;
		align-items: flex-end;
		gap: var(--s-2-5);
		margin-top: calc(-1 * (var(--s-8)));
		position: relative;

		& :global(.avatar) {
			border: 3px solid var(--color-bg);
			margin-block-end: -3px;
		}
	}

	.nameGroup {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--s-6);
		position: absolute;
		top: 18px;
		inset-inline-start: 92px;
	}

	.username {
		font-size: var(--font-lg);
		font-weight: var(--weight-bold);
		line-height: 1.1;
		max-width: 170px;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.subtitle {
		max-width: 170px;
		font-size: var(--font-xs);
		color: var(--color-text-high);
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.friendCode {
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}

	.stats {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2-5);
		font-weight: var(--weight-bold);
	}

	.stat {
		white-space: nowrap;
		flex-shrink: 0;
	}

	.plusStat {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
	}

	.xpStat {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.1;
	}

	.xpPrimary {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
	}

	.xpPrimaryIcons {
		display: inline-flex;
		flex-direction: column;
		align-items: center;

		&:empty {
			display: none;
		}
	}

	.xpVerified {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		font-size: var(--font-2xs);
		color: var(--color-text-high);
	}

	.seasonStat {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
	}

	.seasonTop {
		position: absolute;
		bottom: calc(-1 * var(--s-1));
		left: 50%;
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		padding: 0 var(--s-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background-color: var(--color-bg);
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		line-height: 1;
	}

	.statDivider {
		width: 2px;
		min-width: 2px;
		align-self: stretch;
		background-color: var(--color-border);
	}

	.mutualFriends {
		display: flex;
		align-items: center;
		min-height: var(--field-size-sm);
	}

	.noMutualFriends {
		margin-inline: auto;
		font-style: italic;
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}

	.bio {
		font-size: var(--font-xs);
		color: var(--color-text);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.noteView {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	.noteHeaderGroup {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);

		& :global(.noteDate) {
			font-size: var(--font-2xs);
			color: var(--color-text-high);
		}
	}

	.noteHeader {
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		color: var(--color-text);
	}

	.noteText {
		font-size: var(--font-xs);
		color: var(--color-text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.noteViewActions {
		margin-block-start: var(--s-2);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-4);
	}
</style>
