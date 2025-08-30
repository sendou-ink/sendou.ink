<script lang="ts">
	import * as TeamAPI from '$lib/api/team';
	import Flag from '$lib/components/Flag.svelte';
	import Bsky from '$lib/components/icons/Bsky.svelte';
	import { bskyUrl } from '$lib/utils/urls';
	import { userSubmittedImage } from '$lib/utils/urls-img';
	import * as R from 'remeda';
	import Button from '$lib/components/buttons/Button.svelte';
	import { resolve } from '$app/paths';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import { m } from '$lib/paraglide/messages';
	import UserRoundPen from '@lucide/svelte/icons/user-round-pen';
	import Menu from '$lib/components/menu/Menu.svelte';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import * as AuthAPI from '$lib/api/auth';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import Star from '@lucide/svelte/icons/star';
	import Trash from '@lucide/svelte/icons/trash';
	import { confirmAction } from '$lib/utils/form';
	import { hasPermission } from '$lib/modules/permissions/utils';

	interface Props {
		team: TeamAPI.queries.BySlugData['team'];
	}

	const { team }: Props = $props();

	const countries = $derived(
		R.unique(team.members.map((member) => member.country).filter((country) => country !== null))
	);

	const user = await AuthAPI.queries.me();
	const userMember = $derived(user && team.members.find((member) => member.id === user.id));
</script>

<div class="stack sm">
	<div
		class={['banner', { placeholder: !team.bannerSrc }]}
		style={team.bannerSrc
			? `--team-banner-img: url("${userSubmittedImage(team.bannerSrc)}")`
			: undefined}
	>
		{#if team.avatarSrc}
			<div class="avatar">
				<div>
					<img src={userSubmittedImage(team.avatarSrc)} alt="" />
				</div>
			</div>
		{/if}
		<div class="flags">
			{#each countries as country (country)}
				<Flag countryCode={country} />
			{/each}
		</div>
		<div class="name">
			{team.name}
			{@render bskyLink()}
		</div>
	</div>
	<div class="avatar__spacer"></div>

	<!-- xxx: permissions -->
	<div class="actions-buttons-container">
		<div class="action-buttons">
			<Button
				id="roster-button"
				href={resolve('/t/[slug]/roster', { slug: team.customUrl })}
				variant="outlined"
				size="small"
				icon={UserRoundPen}>{m.key_candid_ox_sew()}</Button
			>
			<Button
				href={resolve('/t/[slug]/edit', { slug: team.customUrl })}
				variant="outlined"
				size="small"
				icon={SquarePen}>{m.common_actions_edit()}</Button
			>
			{#if userMember}
				{@render actionsMenu()}
			{/if}
		</div>
	</div>
</div>

<div class="mobile-name-country">
	<div class="stack horizontal sm">
		{#each countries as country (country)}
			<Flag countryCode={country} />
		{/each}
	</div>
	<div class="mobile-team-name">
		{team.name}
		{@render bskyLink()}
	</div>
</div>

{#snippet bskyLink()}
	{#if team.bsky}
		<a
			class="bsky-link"
			data-testid="bsky-link"
			href={bskyUrl(team.bsky)}
			target="_blank"
			rel="noreferrer"
		>
			<Bsky />
		</a>
	{/if}
{/snippet}

{#snippet actionsMenu()}
	<Menu
		items={[
			{
				label: m.team_actionButtons_makeMainTeam(),
				icon: Star,
				hidden: Boolean(userMember?.isMainTeam),
				onclick: async () => await TeamAPI.actions.makeMainTeam(team.customUrl)
			},
			{
				label: m.team_actionButtons_leaveTeam(),
				destructive: true,
				icon: DoorOpen,
				hidden: team.members.length === 1,
				onclick: () =>
					confirmAction(() => TeamAPI.actions.leave(team.customUrl), {
						title: m.team_leaveTeam_header({ teamName: team.name }),
						button: {
							text: m.team_actionButtons_leaveTeam_confirm()
						}
					})
			},
			{
				label: m.team_actionButtons_deleteTeam(),
				destructive: true,
				icon: Trash,
				hidden: !hasPermission(team, 'ADMIN', user),
				onclick: () =>
					confirmAction(() => TeamAPI.actions.deleteBySlug(team.customUrl), {
						title: m.team_deleteTeam_header({ teamName: team.name })
					})
			}
		]}
	>
		<MenuTriggerButton icon={EllipsisVertical} variant="popover" />
	</Menu>
{/snippet}

<style>
	.banner {
		background-image:
			linear-gradient(
				to bottom,
				rgba(255, 255, 255, 0),
				rgba(255, 255, 255, 0),
				rgba(0, 0, 0, 0.6)
			),
			var(--team-banner-img);
		background-size: cover;
		width: 100%;
		aspect-ratio: 2 / 1;
		display: grid;
		grid-template-areas: 'flags .' 'avatar name';
		padding: var(--s-5);
		border-radius: var(--radius-field);
	}

	.placeholder {
		height: 6rem;
		padding-block-end: 5.5rem;
		background-color: var(--color-primary-transparent);
	}

	.flags {
		grid-area: flags;
		margin-top: -5px;
		display: none;
		column-gap: var(--s-4);

		@media screen and (min-width: 640px) {
			display: flex;
		}
	}

	.name {
		grid-area: name;
		align-self: flex-end;
		justify-self: flex-end;
		font-size: 36px;
		line-height: 1;
		font-weight: var(--bold);
		color: #fff;
		display: none;
		align-items: center;
		gap: var(--s-3);

		@media screen and (min-width: 640px) {
			display: flex;
		}
	}

	.bsky-link {
		padding: var(--s-1);
		border: 1px solid;
		border-radius: 50%;
		border-color: #1285fe;
		background-color: #1285fe2f;
		height: 24.4px;
		width: 24.4px;
		display: grid;
		place-items: center;
	}

	.bsky-link > :global(svg) {
		width: 0.9rem;
	}

	.bsky-link :global(path) {
		fill: #1285fe;
	}

	.avatar {
		grid-area: avatar;
		align-self: flex-end;
		margin-bottom: -110px;

		@media screen and (min-width: 640px) {
			margin-left: var(--s-2);
			margin-bottom: -90px;
		}
	}

	.avatar > div {
		padding: var(--s-2);
		background-color: var(--color-base-bg);
		border-radius: 100%;
		display: grid;
		place-items: center;
		width: 7rem;

		@media screen and (min-width: 640px) {
			width: 10rem;
		}
	}

	.avatar__spacer {
		height: 4rem;
	}

	.mobile-name-country {
		display: flex;
		font-size: var(--fonts-xl);
		align-items: center;
		font-weight: var(--bold);
		flex-direction: column;
		line-height: 1.5;

		@media screen and (min-width: 640px) {
			display: none;
		}
	}

	.mobile-team-name {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.avatar img {
		border-radius: 100%;
	}

	.actions-buttons-container {
		position: relative;
	}

	.action-buttons {
		display: flex;
		gap: var(--s-2-5);
		position: absolute;
		right: 0;
		top: -68px;

		:global {
			path:last-of-type {
				fill: var(--color-primary);
			}
		}
	}
</style>
