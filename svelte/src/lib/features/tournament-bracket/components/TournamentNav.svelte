<!-- The React TournamentNav without its overflow menu: every item is shown (they fit at desktop widths). -->
<script lang="ts">
import {
	CalendarClock,
	ClipboardCheck,
	LayoutGrid,
	Medal,
	ScrollText,
	Settings,
	Trophy,
	Tv,
	UserPlus,
	Users,
} from "@lucide/svelte";
import type { Component } from "svelte";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { tournamentNameParts } from "~/features/tournament/tournament-utils";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import {
	tournamentAdminPage,
	tournamentDivisionsPage,
	tournamentInfoPage,
	tournamentMatchesPage,
	tournamentRegisterPage,
	tournamentResultsPage,
	tournamentRulesPage,
	tournamentStreamsPage,
	tournamentSubsPage,
	tournamentTeamsPage,
} from "~/utils/urls";
import { page } from "$app/state";
import Avatar from "#lib/components/Avatar.svelte";
import { m } from "#lib/paraglide/messages.js";

type NavItemKey =
	| "register"
	| "brackets"
	| "divisions"
	| "matches"
	| "teams"
	| "streams"
	| "results"
	| "rules"
	| "lfg"
	| "admin";

interface NavItem {
	key: NavItemKey;
	label: string;
	to: string;
	icon: Component;
	end?: boolean;
	testId?: string;
}

const PRIORITY_ORDER: NavItemKey[] = [
	"register",
	"brackets",
	"divisions",
	"matches",
	"teams",
	"results",
	"lfg",
	"streams",
	"rules",
	"admin",
];

interface Props {
	tournament: Tournament;
	streamsCount: number;
	user: { id: number } | null | undefined;
}

let { tournament, streamsCount, user }: Props = $props();

const nameParts = $derived(tournamentNameParts(tournament));
const homeHref = $derived(tournamentInfoPage(tournament.ctx.id));
const navItems = $derived(resolveNavItems());

function resolveNavItems(): NavItem[] {
	const items: Partial<Record<NavItemKey, NavItem>> = {};

	// invitational registration is never "open", but captains still need the page for roster & map pool
	const showRegisterForInvitationalCaptain =
		tournament.isInvitational &&
		!tournament.hasStarted &&
		Boolean(tournament.ownedTeamByUser(user as never));

	if (tournament.registrationOpen || showRegisterForInvitationalCaptain) {
		items.register = {
			key: "register",
			label: m.tournament_nav_register(),
			to: tournamentRegisterPage(tournament.ctx.id),
			icon: ClipboardCheck,
			testId: "register-tab",
		};
	}

	if (tournament.leagueDivisions.length > 1) {
		items.divisions = {
			key: "divisions",
			label: m.tournament_nav_divisions(),
			to: tournamentDivisionsPage(tournament.ctx.id),
			icon: LayoutGrid,
			testId: "divisions-tab",
		};
	} else {
		items.brackets = {
			key: "brackets",
			label: m.tournament_nav_brackets(),
			to: tournamentBracketsPage({ tournamentId: tournament.ctx.id }),
			icon: Trophy,
			testId: "brackets-tab",
		};
	}

	if (tournament.isLeague && tournament.hasStarted) {
		items.matches = {
			key: "matches",
			label: m.tournament_nav_matches(),
			to: tournamentMatchesPage(tournament.ctx.id),
			icon: CalendarClock,
			testId: "matches-tab",
		};
	}

	items.teams = {
		key: "teams",
		label: m.tournament_nav_teams({ count: tournament.ctx.teams.length }),
		to: tournamentTeamsPage(tournament.ctx.id),
		icon: Users,
		end: false,
		testId: "teams-tab",
	};

	if (tournament.hasStarted && !tournament.everyBracketOver) {
		items.streams = {
			key: "streams",
			label: m.tournament_nav_streams({ count: streamsCount }),
			to: tournamentStreamsPage(tournament.ctx.id),
			icon: Tv,
		};
	}

	if (tournament.hasStarted) {
		items.results = {
			key: "results",
			label: m.tournament_nav_results(),
			to: tournamentResultsPage(tournament.ctx.id),
			icon: Medal,
			testId: "results-tab",
		};
	}

	if (tournament.hasRulesPage) {
		items.rules = {
			key: "rules",
			label: m.tournament_nav_rules(),
			to: tournamentRulesPage(tournament.ctx.id),
			icon: ScrollText,
		};
	}

	const showLfg =
		!tournament.isInvitational &&
		!tournament.everyBracketOver &&
		tournament.lfgEnabled;
	if (showLfg) {
		items.lfg = {
			key: "lfg",
			label: tournament.registrationOpen
				? m.tournament_nav_looking()
				: m.tournament_nav_subs(),
			to: tournamentSubsPage(tournament.ctx.id),
			icon: UserPlus,
		};
	}

	const showAdmin =
		tournament.isOrganizer(user as never) &&
		(!tournament.ctx.isFinalized || DANGEROUS_CAN_ACCESS_DEV_CONTROLS);
	if (showAdmin) {
		items.admin = {
			key: "admin",
			label: m.tournament_nav_admin(),
			to: tournamentAdminPage(tournament.ctx.id),
			icon: Settings,
			end: false,
			testId: "admin-tab",
		};
	}

	return PRIORITY_ORDER.flatMap((key) => (items[key] ? [items[key]!] : []));
}

// like React Router's NavLink: `end` matches the path exactly, otherwise also its subpaths
function isActive(to: string, end = true) {
	const path = to.split("?")[0];
	const current = page.url.pathname;
	return end ? current === path : current === path || current.startsWith(`${path}/`);
}
</script>

<nav class="nav" aria-label={m.tournament_nav_label()}>
	<a
		href={homeHref}
		class="identity"
		aria-current={isActive(homeHref) ? "page" : undefined}
	>
		<Avatar url={tournament.ctx.logoUrl} size="sm" alt="" />
		<div class="identity-text">
			<span class="identity-name truncate">{nameParts.name}</span>
			{#if nameParts.subtext}
				<span class="identity-subtext">{nameParts.subtext}</span>
			{/if}
		</div>
	</a>

	<div class="separator" aria-hidden="true"></div>

	<div class="items-wrapper">
		<ul class="items">
			{#each navItems as item (item.key)}
				{@const active = isActive(item.to, item.end)}
				<li class="item-slot">
					<a
						href={item.to}
						class={["link", active && "link-active"]}
						aria-current={active ? "page" : undefined}
						data-testid={item.testId}
					>
						<span class="icon" aria-hidden="true"><item.icon /></span>
						<span class="label">{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</nav>

<style>
	@layer features {
		.nav {
			display: flex;
			align-items: center;
			gap: var(--s-3);
			padding: var(--s-2) 0;
			margin-block-end: var(--s-4);
			min-width: 0;
		}

		.identity {
			display: flex;
			align-items: center;
			gap: var(--s-2);
			color: var(--color-text);
			text-decoration: none;
			min-width: 0;
			flex-shrink: 0;
		}

		.identity-text {
			display: flex;
			flex-direction: column;
			gap: var(--s-0-5);
			min-width: 0;
		}

		.identity-name {
			font-size: var(--font-sm);
			font-weight: var(--weight-bold);
			max-width: 14ch;
			margin: 0 auto;
		}

		.identity-subtext {
			display: flex;
			align-items: center;
			gap: var(--s-1);
			font-size: var(--font-2xs);
			font-weight: var(--weight-semi);
			color: var(--color-text-high);

			&::before,
			&::after {
				content: "";
				flex: 1;
				border-bottom: 1.5px solid var(--color-text-high);
			}
		}

		.separator {
			flex-shrink: 0;
			width: 2px;
			height: 28px;
			background-color: var(--color-border);
		}

		.items-wrapper {
			position: relative;
			flex: 1;
			min-width: 0;
			overflow: hidden;
		}

		.items {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			gap: var(--s-0-5);
			flex-wrap: nowrap;
			white-space: nowrap;
		}

		.link {
			display: inline-flex;
			align-items: center;
			gap: var(--s-1-5);
			padding: var(--s-1) var(--s-2-5);
			border-radius: var(--radius-field);
			color: var(--color-text);
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			text-decoration: none;
			cursor: pointer;
			min-width: max-content;

			&:hover {
				background-color: var(--color-bg-high);
			}
		}

		.link-active {
			color: var(--color-fg-accent);
			background-color: var(--color-bg-high);
		}

		.icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;

			& > :global(svg) {
				width: 16px;
				height: 16px;
			}
		}

		.label {
			white-space: nowrap;
		}
	}
</style>
