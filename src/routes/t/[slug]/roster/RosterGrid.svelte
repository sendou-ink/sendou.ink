<script lang="ts">
	import * as TeamAPI from '$lib/api/team';
	import Avatar from '$lib/components/Avatar.svelte';
	import Menu from '$lib/components/menu/Menu.svelte';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';
	import Key from '@lucide/svelte/icons/key';
	import Pencil from '@lucide/svelte/icons/pencil';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Select from '$lib/components/Select.svelte';
	import * as AuthAPI from '$lib/api/auth';
	import { confirmAction } from '$lib/utils/form';
	import { TEAM_MEMBER_ROLES } from '$lib/constants/team';
	import UserX from '@lucide/svelte/icons/user-x';
	import { m } from '$lib/paraglide/messages';
	import { teamRoleTranslations } from '$lib/utils/i18n';
	import type { MemberRole } from '$lib/server/db/tables';
	import { hasPermission } from '$lib/modules/permissions/utils';

	interface Props {
		team: TeamAPI.queries.BySlugData['team'];
	}

	const { team }: Props = $props();

	const user = await AuthAPI.queries.me();
</script>

<!-- xxx: clean up the copy pasted class -->
<div class="container stack md">
	<h2 class="text-lg">Team Roster</h2>
	<div class="grid">
		{#each team.members as member (member.id)}
			<div class="member-cell">
				<Avatar size="sm" user={member} />
				<div>
					{member.username}
					{#if member.isOwner}
						<div class="stack horizontal xxs items-center font-semi-bold text-xs text-lighter">
							<Key /> Owner
						</div>
					{/if}
					{#if member.isManager}
						<div class="stack horizontal xxs items-center font-semi-bold text-xs text-lighter">
							<Pencil /> Editor
						</div>
					{/if}
					{#if !member.isManager && !member.isOwner}
						<div class="member-spacer"></div>
					{/if}
				</div>
			</div>

			<div class="stack horizontal items-center md">
				<Select
					value={member.role}
					clearable
					items={TEAM_MEMBER_ROLES.map((role) => ({
						label: teamRoleTranslations[role](),
						value: role
					}))}
					onchange={async (event) =>
						await TeamAPI.actions.updateTeamMember({
							slug: team.customUrl,
							userId: member.id,
							delta: { role: (event.currentTarget.value as MemberRole) || null }
						})}
				/>
				<div>
					{#if member.id !== user?.id}
						<Menu
							items={[
								{
									label: m.still_known_orangutan_hush(),
									icon: Pencil,
									onclick: async () =>
										await TeamAPI.actions.updateTeamMember({
											slug: team.customUrl,
											userId: member.id,
											delta: { isManager: true }
										}),
									hidden: Boolean(member.isOwner || member.isManager)
								},
								{
									label: m.heavy_extra_donkey_cuddle(),
									icon: Pencil,
									onclick: async () =>
										await TeamAPI.actions.updateTeamMember({
											slug: team.customUrl,
											userId: member.id,
											delta: { isManager: false }
										}),
									hidden: Boolean(member.isOwner || !member.isManager),
									destructive: true
								},
								{
									label: m.team_actionButtons_kick(),
									icon: UserX,
									onclick: () =>
										confirmAction(
											() =>
												TeamAPI.actions.kick({
													slug: team.customUrl,
													userId: member.id
												}),
											{
												title: m.team_kick_header({ user: member.username, teamName: team.name }),
												button: {
													text: m.team_actionButtons_kick()
												}
											}
										),
									hidden: !hasPermission(team, 'ADMIN', user),
									destructive: true
								}
							]}
						>
							<MenuTriggerButton icon={EllipsisVertical} variant="popover" size="small" />
						</Menu>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.container {
		:global {
			svg {
				max-width: 14px;
				stroke-width: 2.5px;
			}
		}
	}

	.member-cell {
		line-height: 1.1;
		font-weight: var(--bold);
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}

	.member-spacer {
		height: 24px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(1, max-content);
		align-items: center;
		row-gap: var(--s-4);
		column-gap: var(--s-6);

		@media screen and (min-width: 640px) {
			grid-template-columns: repeat(2, max-content);
		}
	}
</style>
