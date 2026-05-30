import clsx from "clsx";
import {
	ClipboardCheck,
	LayoutGrid,
	ListOrdered,
	Medal,
	Menu,
	ScrollText,
	Settings,
	Trophy,
	Tv,
	UserPlus,
	Users,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { useUser } from "~/features/auth/core/user";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import {
	tournamentDivisionsPage,
	tournamentInfoPage,
	tournamentRulesPage,
} from "~/utils/urls";
import { splitTournamentName } from "../core/Tournament";
import styles from "./TournamentNav.module.css";

type NavItemKey =
	| "register"
	| "brackets"
	| "teams"
	| "divisions"
	| "streams"
	| "results"
	| "rules"
	| "lfg"
	| "seeds"
	| "admin";

interface NavItem {
	key: NavItemKey;
	label: string;
	to: string;
	icon: React.ReactNode;
	end?: boolean;
	testId?: string;
}

const PRIORITY_ORDER: NavItemKey[] = [
	"register",
	"lfg",
	"brackets",
	"results",
	"teams",
	"divisions",
	"streams",
	"rules",
	"seeds",
	"admin",
];

export function TournamentNav({
	tournament,
	hasChildTournaments,
}: {
	tournament: Tournament;
	hasChildTournaments: boolean;
}) {
	const { t } = useTranslation(["tournament"]);
	const navItems = useNavItems({ tournament, hasChildTournaments });
	const { visibleCount, containerRef, measureRef } = useNavOverflow(
		navItems.length,
	);
	const [overflowOpen, setOverflowOpen] = React.useState(false);

	const overflowItems = navItems.slice(visibleCount);

	const { name, subtext } = splitTournamentName(
		tournament.ctx.name,
		tournament.ctx.organization?.series ?? [],
	);

	const homeHref = tournament.isLeagueDivision
		? tournamentInfoPage(tournament.ctx.parentTournamentId!)
		: tournamentInfoPage(tournament.ctx.id);

	return (
		<nav className={styles.nav} aria-label={t("tournament:nav.label")}>
			<NavLink to={homeHref} className={styles.identity} end>
				<Avatar url={tournament.ctx.logoUrl} size="sm" alt="" />
				<div className={styles.identityText}>
					<span className={styles.identityName}>{name}</span>
					{subtext ? (
						<span className={styles.identitySubtext}>{subtext}</span>
					) : null}
				</div>
			</NavLink>

			<div className={styles.separator} aria-hidden="true" />

			<div className={styles.itemsWrapper} ref={containerRef}>
				<ul className={styles.items} ref={measureRef}>
					{navItems.map((item, index) => (
						<li
							key={item.key}
							className={styles.itemSlot}
							data-hidden={index >= visibleCount ? "true" : undefined}
						>
							<NavItemLink item={item} />
						</li>
					))}
				</ul>
			</div>

			{overflowItems.length > 0 ? (
				<SendouPopover
					placement="bottom end"
					isOpen={overflowOpen}
					onOpenChange={setOverflowOpen}
					trigger={
						<SendouButton
							variant="minimal"
							size="big"
							icon={<Menu />}
							aria-label={t("tournament:nav.moreItems")}
							className={styles.hamburger}
						/>
					}
				>
					<ul className={styles.overflowList}>
						{overflowItems.map((item) => (
							<li key={item.key}>
								<NavItemLink
									item={item}
									overflow
									onNavigate={() => setOverflowOpen(false)}
								/>
							</li>
						))}
					</ul>
				</SendouPopover>
			) : null}
		</nav>
	);
}

function useNavItems({
	tournament,
	hasChildTournaments,
}: {
	tournament: Tournament;
	hasChildTournaments: boolean;
}): NavItem[] {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();

	const items: Partial<Record<NavItemKey, NavItem>> = {};

	if (tournament.registrationOpen) {
		items.register = {
			key: "register",
			label: t("tournament:nav.register"),
			to: "register",
			icon: <ClipboardCheck />,
			testId: "register-tab",
		};
	}

	const showBrackets = tournament.hasStarted && !tournament.isLeagueSignup;
	if (showBrackets) {
		items.brackets = {
			key: "brackets",
			label: t("tournament:nav.brackets"),
			to: "brackets",
			icon: <Trophy />,
			testId: "brackets-tab",
		};
	}

	const showTeams = !(tournament.isLeagueSignup && hasChildTournaments);
	if (showTeams) {
		items.teams = {
			key: "teams",
			label: t("tournament:nav.teams", {
				count: tournament.ctx.teams.length,
			}),
			to: "teams",
			icon: <Users />,
			end: false,
			testId: "teams-tab",
		};
	}

	if (tournament.isLeagueSignup || tournament.isLeagueDivision) {
		items.divisions = {
			key: "divisions",
			label: t("tournament:nav.divisions"),
			to: tournamentDivisionsPage(
				tournament.ctx.parentTournamentId ?? tournament.ctx.id,
			),
			icon: <LayoutGrid />,
		};
	}

	if (tournament.hasStarted && !tournament.everyBracketOver) {
		items.streams = {
			key: "streams",
			label: t("tournament:nav.streams", {
				count: tournament.streams.length,
			}),
			to: "streams",
			icon: <Tv />,
		};
	}

	if (tournament.hasStarted) {
		items.results = {
			key: "results",
			label: t("tournament:nav.results"),
			to: "results",
			icon: <Medal />,
			testId: "results-tab",
		};
	}

	if (tournament.ctx.rules) {
		items.rules = {
			key: "rules",
			label: t("tournament:nav.rules"),
			to: tournamentRulesPage(tournament.ctx.id),
			icon: <ScrollText />,
		};
	}

	const showLfg =
		!tournament.isInvitational &&
		!tournament.everyBracketOver &&
		!(tournament.isLeagueSignup && !tournament.registrationOpen) &&
		tournament.lfgEnabled;
	if (showLfg) {
		items.lfg = {
			key: "lfg",
			label: tournament.registrationOpen
				? t("tournament:nav.looking")
				: t("tournament:nav.subs"),
			to: "looking",
			icon: <UserPlus />,
		};
	}

	const showSeeds =
		tournament.isOrganizer(user) &&
		!tournament.hasStarted &&
		!tournament.isLeagueSignup;
	if (showSeeds) {
		items.seeds = {
			key: "seeds",
			label: t("tournament:nav.seeds"),
			to: "seeds",
			icon: <ListOrdered />,
		};
	}

	const showAdmin =
		tournament.isOrganizer(user) &&
		(!tournament.ctx.isFinalized || DANGEROUS_CAN_ACCESS_DEV_CONTROLS);
	if (showAdmin) {
		items.admin = {
			key: "admin",
			label: t("tournament:nav.admin"),
			to: "admin",
			icon: <Settings />,
			testId: "admin-tab",
		};
	}

	return PRIORITY_ORDER.flatMap((key) => (items[key] ? [items[key]!] : []));
}

function NavItemLink({
	item,
	overflow = false,
	onNavigate,
}: {
	item: NavItem;
	overflow?: boolean;
	onNavigate?: () => void;
}) {
	return (
		<NavLink
			to={item.to}
			end={item.end ?? true}
			prefetch="intent"
			className={({ isActive }) =>
				clsx(overflow ? styles.overflowLink : styles.link, {
					[styles.linkActive]: isActive,
				})
			}
			onClick={onNavigate}
			data-testid={item.testId}
		>
			<span className={styles.icon} aria-hidden="true">
				{item.icon}
			</span>
			<span className={styles.label}>{item.label}</span>
		</NavLink>
	);
}

const ITEM_GAP = 4;

function useNavOverflow(totalItems: number) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const measureRef = React.useRef<HTMLUListElement>(null);
	const [visibleCount, setVisibleCount] = React.useState(totalItems);

	useIsomorphicLayoutEffect(() => {
		const container = containerRef.current;
		const list = measureRef.current;
		if (!container || !list) return;

		const slots = Array.from(list.children) as HTMLElement[];

		const computeVisible = () => {
			const containerWidth = container.clientWidth;

			let used = 0;
			let count = 0;
			for (const slot of slots) {
				const width = slot.scrollWidth + (count === 0 ? 0 : ITEM_GAP);
				if (used + width <= containerWidth) {
					used += width;
					count++;
				} else {
					break;
				}
			}
			setVisibleCount(count);
		};

		computeVisible();

		const observer = new ResizeObserver(() => computeVisible());
		observer.observe(container);
		for (const slot of slots) {
			observer.observe(slot);
		}

		return () => observer.disconnect();
	}, [totalItems]);

	return { visibleCount, containerRef, measureRef };
}
