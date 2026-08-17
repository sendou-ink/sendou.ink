<script module lang="ts">
import type { CommonUser } from "#lib/server/kysely.ts";

export interface RosterTabMember extends CommonUser {
	inGameName?: string | null;
}

export interface RosterTabTeam {
	team?: {
		id: number;
		name: string;
		url: string;
		avatar?: string;
	};
	defaultName?: string;
	members: Array<RosterTabMember>;
}
</script>

<script lang="ts">
import { TabPanel } from "@sendou/components";
import invariant from "@sendou/utils/invariant";
import Avatar from "#lib/components/Avatar.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import UserCard from "#lib/features/user-page/components/UserCard.svelte";
import { getUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import { TAB_KEYS } from "./match-page-constants.ts";

// xxx: the active-roster editing flow (canEditSubbedOut/defaultIsEditing/
// onSubbedOutChange/minMembersPerTeam), subbed-out popover, member tiers,
// weapon pools and tournament seeds are not ported yet — the scrims usage
// never reaches them (sendouq/tournament-only)

interface Props {
	teams: [RosterTabTeam, RosterTabTeam];
}

let { teams }: Props = $props();

const userCardContext = getUserCardContext();

function defaultNameOf(team: RosterTabTeam) {
	invariant(team.defaultName, "team or defaultName must be provided");
	return team.defaultName;
}
</script>

<TabPanel id={TAB_KEYS.ROSTERS}>
	<div class="rosters">
		{@render teamRoster(teams[0], "alpha")}
		<div class="rostersDivider"></div>
		{@render teamRoster(teams[1], "bravo")}
	</div>
</TabPanel>

{#snippet teamRoster(team: RosterTabTeam, side: "alpha" | "bravo")}
	<div class="stack xxs rosterColumn">
		{@render teamHeader(team, side)}
		{#if team.members.length > 0}
			<ul class="rosterMembers">
				{#each team.members as member (member.id)}
					<li class="memberGrid">
						{@render rosterMemberLink(member)}
						<div class="memberSecondRow">
							<div class="memberTier"></div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

{#snippet teamHeader(team: RosterTabTeam, side: "alpha" | "bravo")}
	{#if team.team}
		<a href={team.team.url} class="stack horizontal sm">
			<Avatar
				url={team.team.avatar}
				identiconInput={team.team.name}
				size="sm"
			/>
			<div class="stack justify-center line-height-tight teamHeaderText">
				<h2
					class="text-main-forced font-bold teamNameHeading"
					title={team.team.name}
				>
					{team.team.name}
				</h2>
				{@render teamHeaderMeta()}
			</div>
		</a>
	{:else}
		{@const defaultName = defaultNameOf(team)}
		<div class="stack horizontal sm">
			<div class="teamAvatar" data-side={side}></div>
			<div class="stack justify-center line-height-tight teamHeaderText">
				<h2
					class="text-main-forced font-bold teamNameHeading"
					title={defaultName}
				>
					{defaultName}
				</h2>
				{@render teamHeaderMeta()}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet teamHeaderMeta()}
	<!-- xxx: tournament seed + sendouq tier render here once those features migrate -->
	<div class="stack xs horizontal items-center text-lighter"></div>
{/snippet}

{#snippet rosterMemberLink(member: RosterTabMember)}
	{@const sentiment = userCardContext
		?.userCards()
		?.get(member.id)?.privateNote?.sentiment}
	<UserCard userId={member.id}>
		<span class="memberLink">
			<NoteAvatar {sentiment} size="xs">
				<Avatar user={member} size="xxs" />
			</NoteAvatar>
			<div class="memberNameStack">
				<span>{member.username}</span>
				{#if member.inGameName}
					<span class="memberInGameName">{member.inGameName}</span>
				{/if}
			</div>
		</span>
	</UserCard>
{/snippet}

<style>
	.rosters {
		display: flex;
		flex-direction: column;
		gap: var(--s-8);
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		width: max-content;
		max-width: 100%;
		margin-inline: auto;
	}

	.rostersDivider {
		display: none;
	}

	@container (width >= 640px) {
		.rosters {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
			gap: var(--s-4);
			width: auto;
			max-width: none;
			margin-inline: 0;
		}

		.rosterColumn {
			margin-inline: auto;
			width: max-content;
			max-width: 100%;
			min-width: 0;
		}

		.rostersDivider {
			display: block;
			background-color: var(--color-border);
			width: 1px;
			align-self: stretch;
		}
	}

	.teamHeaderText {
		min-width: 0;
	}

	.teamNameHeading {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 320px;
	}

	.rosterMembers {
		position: relative;
		padding-inline-start: 34px;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--s-2-5);
		margin-top: var(--s-2);

		&::before {
			content: "";
			position: absolute;
			inset-inline-start: 21px;
			top: -8px;
			bottom: 0;
			width: 3px;
			background-color: var(--color-border-high);
			opacity: 0.3;
			border-radius: 0 0 var(--radius-field) var(--radius-field);
		}
	}

	.memberGrid {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-1);
		min-width: 0;

		& > * {
			max-width: 100%;
			min-width: 0;
		}
	}

	.memberLink {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		max-width: 100%;
		min-width: 0;
	}

	.memberSecondRow {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.memberNameStack {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		min-width: 0;

		& > span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 100%;
		}
	}

	.memberInGameName {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		font-weight: var(--weight-semi);
	}

	.memberTier {
		display: flex;
		justify-content: center;
		width: 24px;
		flex-shrink: 0;
	}

	.teamAvatar {
		border-radius: var(--radius-avatar);
		width: 44px;
		height: 44px;
		flex-shrink: 0;

		&[data-side="alpha"] {
			background-color: var(--color-accent);
		}

		&[data-side="bravo"] {
			background-color: var(--color-second);
		}
	}
</style>
