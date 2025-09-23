<script lang="ts">
	import * as TournamentAPI from '$lib/api/tournament';
	import RegFlowSection from './RegFlowSection.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Divider from '$lib/components/Divider.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { confirmAction } from '$lib/utils/form';
	import * as TournamentTeamAPI from '$lib/api/tournament-team';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Menu from '$lib/components/menu/Menu.svelte';
	import * as AuthAPI from '$lib/api/auth';
	import InviteLink from '$lib/components/InviteLink.svelte';
	import { resolve } from '$app/paths';
	import * as UserAPI from '$lib/api/user';

	const { tournamentId }: { tournamentId: string } = $props();

	const { members, minMembers, maxMembers, canChangeRegistration, inviteCode } = $derived(
		await TournamentAPI.queries.myRegistrationById(tournamentId)
	);

	type Member = NonNullable<typeof members>[number];

	const memberSlots = $derived(
		((members as Array<Member | null>) ?? []).concat(
			Array(maxMembers - (members?.length ?? 0)).fill(null)
		)
	);
</script>

<RegFlowSection>
	<div class="container stack lg">
		<h2 class="text-lg">Roster</h2>

		<div class="stack md">
			{#each memberSlots as member, i (i)}
				{#if i === minMembers}
					<Divider>Minimum roster size (4)</Divider>
				{/if}
				{@render memberRow(member, i + 1)}
			{/each}
		</div>

		{#if inviteCode}
			<InviteLink
				code={inviteCode}
				url={resolve('/to/[id]/register', { id: tournamentId })}
				onReset={async () => await TournamentTeamAPI.actions.resetInviteCode(tournamentId)}
				resetPending={TournamentTeamAPI.actions.resetInviteCode.pending > 0}
			/>
		{/if}
	</div>
</RegFlowSection>

{#snippet memberRow(member: Member | null, nth: number)}
	{#if member}
		<div class="member-row">
			<Avatar user={member} size="sm" />
			{member.name}
			{#if canChangeRegistration && member.userId !== (await AuthAPI.queries.me())?.id}
				{@render memberActions(member)}
			{/if}
		</div>
		{#if member.userId === (await AuthAPI.queries.me())?.id}
			<div class="text-xs text-lighter font-semi-bold italic">
				Your friend code is <b>SW-{await UserAPI.queries.myFriendCode()}</b>. Make sure you play on
				the account matching this friend code. Not doing so might be considered alting which is a
				bannable offense.
			</div>
		{/if}
	{:else}
		<div class="member-row placeholder"><span>Member {nth}</span></div>
	{/if}
{/snippet}

{#snippet memberActions(member: Member)}
	<div class="ml-auto">
		<Menu
			items={[
				{
					label: 'Delete',
					icon: Trash2,
					onclick: () =>
						confirmAction(
							() => TournamentTeamAPI.actions.removeMember({ tournamentId, userId: member.userId }),
							{
								title: `Are you sure you want to remove ${member.name} from the team?`
							}
						),
					destructive: true
				}
			]}
		>
			<MenuTriggerButton icon={EllipsisVertical} variant="popover" size="small" />
		</Menu>
	</div>
{/snippet}

<style>
	.container {
		--divider-font-size: var(--fonts-xs);
		--divider-line-color: var(--color-base-card);
		--divider-text-color: var(--color-base-content);
	}
	.member-row {
		display: flex;
		gap: var(--s-2);
		align-items: center;
		padding: var(--s-2) var(--s-3);
		font-weight: var(--semi-bold);
		border: 2px dotted var(--color-base-card);
		border-radius: var(--radius-box);
		background-color: var(--color-base-card-section);
		min-height: 64px;

		&.placeholder {
			background-color: transparent;
			color: var(--color-base-content-secondary);
			font-size: var(--fonts-md);
			font-style: italic;
			font-weight: var(--bold);

			& span {
				margin: 0 auto;
			}
		}
	}
</style>
