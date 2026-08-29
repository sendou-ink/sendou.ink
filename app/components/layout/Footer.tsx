import clsx from "clsx";
import { Braces, CircleHelp, Hand, Heart, HeartHandshake } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import * as R from "remeda";
import { Config } from "~/config";
import { leaderboardsPage } from "~/features/leaderboards/leaderboards-urls";
import { usePatrons } from "~/hooks/swr";
import { useHasRole } from "~/modules/permissions/hooks";
import { GIT_COMMIT } from "~/utils/git-commit";
import {
	ANALYZER_URL,
	API_PAGE,
	ART_PAGE,
	ARTICLES_MAIN_PAGE,
	ASSOCIATIONS_PAGE,
	BUILDS_PAGE,
	CALENDAR_PAGE,
	COMP_ANALYZER_URL,
	CONTRIBUTIONS_PAGE,
	EVENTS_PAGE,
	FAQ_PAGE,
	LFG_PAGE,
	LINKS_PAGE,
	LUTI_PAGE,
	MAPS_URL,
	NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL,
	navIconUrl,
	OBJECT_DAMAGE_CALCULATOR_URL,
	PLANNER_URL,
	PLUS_SUGGESTIONS_PAGE,
	PLUS_VOTING_RESULTS_PAGE,
	SENDOU_INK_DISCORD_URL,
	SENDOU_INK_GITHUB_URL,
	SENDOU_LOVE_EMOJI_PATH,
	SENDOUQ_PAGE,
	SENDOUQ_RULES_PAGE,
	SETTINGS_PAGE,
	SUPPORT_PAGE,
	scrimsPage,
	TIER_LIST_MAKER_URL,
	TIERS_PAGE,
	TROPHIES_PAGE,
	userPage,
	VODS_PAGE,
	WELCOME_PAGE,
	weaponParamsPage,
	XSEARCH_PAGE,
} from "~/utils/urls";
import { LinkButton } from "../elements/Button";
import { Image } from "../Image";
import { DiscordIcon } from "../icons/Discord";
import { GitHubIcon } from "../icons/GitHub";
import { PatreonIcon } from "../icons/Patreon";
import styles from "./Footer.module.css";

const MARQUEE_ROWS_COUNT = 3;
const MARQUEE_MOUNT_MARGIN = "400px";

const SITEMAP_COLUMNS = [
	{
		title: "nav.play",
		items: [
			{ name: "sendouq", url: SENDOUQ_PAGE },
			{ name: "sendouq", url: SENDOUQ_RULES_PAGE, label: "footer.link.qRules" },
			{ name: "sendouq", url: TIERS_PAGE, label: "footer.link.tiers" },
			{ name: "scrims", url: scrimsPage() },
			{ name: "lfg", url: LFG_PAGE },
			{ name: "calendar", url: CALENDAR_PAGE },
			{ name: "calendar", url: EVENTS_PAGE, label: "footer.link.events" },
			{
				name: "leaderboards",
				url: leaderboardsPage({ type: "USER" }),
				label: "footer.link.userLeaderboard",
			},
			{
				name: "leaderboards",
				url: leaderboardsPage({ type: "TEAM" }),
				label: "footer.link.teamLeaderboard",
			},
			{
				name: "leaderboards",
				url: leaderboardsPage({ type: "XP-ALL" }),
				label: "footer.link.xpLeaderboard",
			},
			...(Config.showLutiNavItem
				? [{ name: "luti", url: LUTI_PAGE } as const]
				: []),
		],
	},
	{
		title: "nav.tools",
		items: [
			{ name: "analyzer", url: ANALYZER_URL },
			{
				name: "analyzer",
				url: weaponParamsPage("splattershot"),
				label: "footer.link.params",
			},
			{ name: "comp-analyzer", url: COMP_ANALYZER_URL },
			{ name: "object-damage-calculator", url: OBJECT_DAMAGE_CALCULATOR_URL },
			{ name: "plans", url: PLANNER_URL },
			{ name: "maps", url: MAPS_URL },
			{ name: "tier-list-maker", url: TIER_LIST_MAKER_URL },
			{ name: "xsearch", url: XSEARCH_PAGE },
			{ name: "settings", url: SETTINGS_PAGE },
		],
	},
	{
		title: "nav.community",
		items: [
			{ name: "builds", url: BUILDS_PAGE },
			{
				name: "associations",
				url: ASSOCIATIONS_PAGE,
				label: "footer.link.associations",
			},
			{ name: "art", url: ART_PAGE },
			{ name: "articles", url: ARTICLES_MAIN_PAGE },
			{ name: "vods", url: VODS_PAGE },
			{ name: "trophies", url: TROPHIES_PAGE },
			{ name: "links", url: LINKS_PAGE },
			{
				name: "plus",
				url: PLUS_SUGGESTIONS_PAGE,
				label: "footer.link.plusSuggestions",
			},
			{
				name: "plus",
				url: PLUS_VOTING_RESULTS_PAGE,
				label: "footer.link.plusVotingResults",
			},
		],
	},
] as const;

export function Footer() {
	const { t } = useTranslation(["common", "front"]);
	const isPatron = useHasRole("MINOR_SUPPORT");

	const showPrivacySettings = Config.fuseEnabled && !isPatron;

	const currentYear = new Date().getFullYear();

	return (
		<footer className={styles.footer}>
			<div className={styles.cards}>
				<FooterCard
					icon={<GitHubIcon className={styles.cardIcon} />}
					title="GitHub"
					subtitle={t("common:footer.github.subtitle")}
					href={SENDOU_INK_GITHUB_URL}
				/>
				<FooterCard
					icon={<DiscordIcon className={styles.cardIcon} />}
					title="Discord"
					subtitle={t("common:footer.discord.subtitle")}
					href={SENDOU_INK_DISCORD_URL}
				/>
				<FooterCard
					icon={<PatreonIcon className={styles.cardIcon} />}
					title="Patreon"
					subtitle={t("common:footer.patreon.subtitle")}
					to={SUPPORT_PAGE}
				/>
				<FooterCard
					icon={<HeartHandshake className={styles.cardIcon} />}
					title={t("common:pages.contributors")}
					subtitle={t("common:footer.contributors.subtitle")}
					to={CONTRIBUTIONS_PAGE}
				/>
				<FooterCard
					icon={<CircleHelp className={styles.cardIcon} />}
					title={t("common:pages.faq")}
					subtitle={t("common:footer.faq.subtitle")}
					to={FAQ_PAGE}
				/>
				<FooterCard
					icon={<Hand className={styles.cardIcon} />}
					title={t("common:pages.welcome")}
					subtitle={t("common:footer.welcome.subtitle")}
					to={WELCOME_PAGE}
				/>
				<FooterCard
					icon={<Braces className={styles.cardIcon} />}
					title={t("common:pages.api")}
					subtitle={t("common:footer.api.subtitle")}
					to={API_PAGE}
				/>
			</div>
			<div className={styles.thanks}>
				<Image alt="" path={SENDOU_LOVE_EMOJI_PATH} width={40} height={40} />
				<h4 className={styles.thanksTitle}>{t("common:footer.thanks")}</h4>
				<p className={styles.thanksSubtitle}>
					{t("common:footer.thanks.subtitle")}
				</p>
			</div>
			<PatronMarquee />
			{isPatron ? null : (
				<LinkButton
					to={SUPPORT_PAGE}
					size="small"
					variant="primary"
					icon={<Heart fill="currentColor" />}
					className={styles.cta}
				>
					{t("common:footer.support")}
				</LinkButton>
			)}
			<div className={styles.sitemap}>
				{SITEMAP_COLUMNS.map((column) => (
					<nav
						key={column.title}
						className={styles.sitemapColumn}
						aria-label={t(`front:${column.title}`)}
					>
						<h5 className={styles.sitemapTitle}>
							{t(`front:${column.title}`)}
						</h5>
						{column.items.map((item) => (
							<Link key={item.url} to={item.url} className={styles.sitemapLink}>
								<Image
									path={navIconUrl(item.name)}
									alt=""
									size={18}
									containerClassName={styles.sitemapIcon}
								/>
								{"label" in item
									? t(`common:${item.label}`)
									: t(`common:pages.${item.name}`)}
							</Link>
						))}
					</nav>
				))}
			</div>
			{showPrivacySettings ? (
				<div className={styles.privacy} data-fuse-privacy-tool />
			) : null}
			<div className={styles.legal}>
				<p>
					sendou.ink © Copyright of Sendou and contributors 2019-{currentYear}.
					Original content & source code is licensed under the AGPL-3.0 license.
				</p>
				<p>
					Splatoon is trademark & © of Nintendo 2014-{currentYear}. sendou.ink
					is not affiliated with Nintendo.
				</p>
				<p>
					All tournaments hosted on sendou.ink are unofficial and are not
					sponsored by or affiliated with Nintendo. Terms for participating in
					and viewing Community Tournaments using Nintendo Games can be found
					here:{" "}
					<a
						href={NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
						target="_blank"
						rel="noreferrer"
					>
						{NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
					</a>
				</p>
			</div>
			{GIT_COMMIT ? (
				<a
					className={styles.versionLink}
					href={`${SENDOU_INK_GITHUB_URL}/commits/${GIT_COMMIT}/`}
					target="_blank"
					rel="noreferrer"
				>
					{t("common:footer.version")} {GIT_COMMIT.slice(0, 10)}
				</a>
			) : null}
		</footer>
	);
}

type Patron = NonNullable<ReturnType<typeof usePatrons>["patrons"]>[number];

function PatronMarquee() {
	const ref = useRef<HTMLDivElement>(null);
	const hasScrolledIntoView = useHasScrolledIntoView(ref);

	return (
		<div
			ref={ref}
			className={clsx(styles.marquee, {
				[styles.marqueePlaceholder]: !hasScrolledIntoView,
			})}
		>
			{hasScrolledIntoView ? <PatronMarqueeRows /> : null}
		</div>
	);
}

function PatronMarqueeRows() {
	const { patrons } = usePatrons();

	if (!patrons || patrons.length === 0) return null;

	const rows = R.chunk(patrons, Math.ceil(patrons.length / MARQUEE_ROWS_COUNT));

	return rows.map((row) => (
		<div key={row[0].id} className={styles.marqueeRow}>
			<PatronChips patrons={row} />
			<PatronChips patrons={row} ariaHidden />
		</div>
	));
}

function PatronChips({
	patrons,
	ariaHidden = false,
}: {
	patrons: Array<Patron>;
	ariaHidden?: boolean;
}) {
	return (
		<ul className={styles.marqueeGroup} aria-hidden={ariaHidden}>
			{patrons.map((patron) => (
				<li key={patron.id}>
					<Link
						to={userPage(patron)}
						className={styles.chip}
						data-custom-theme={patron.customTheme ? true : undefined}
						style={customThemeChipStyle(patron.customTheme)}
						tabIndex={ariaHidden ? -1 : undefined}
					>
						{patron.username}
					</Link>
				</li>
			))}
		</ul>
	);
}

function FooterCard({
	icon,
	title,
	subtitle,
	href,
	to,
}: {
	icon: ReactNode;
	title: string;
	subtitle: string;
	href?: string;
	to?: string;
}) {
	const content = (
		<>
			{icon}
			<span className={styles.cardHeader}>
				{title}
				<span>{subtitle}</span>
			</span>
		</>
	);

	if (href) {
		return (
			<a className={styles.card} href={href} target="_blank" rel="noreferrer">
				{content}
			</a>
		);
	}

	return (
		<Link className={styles.card} to={to ?? "/"}>
			{content}
		</Link>
	);
}

function useHasScrolledIntoView(ref: RefObject<HTMLElement | null>) {
	const [hasScrolledIntoView, setHasScrolledIntoView] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;

				setHasScrolledIntoView(true);
				observer.disconnect();
			},
			{ rootMargin: MARQUEE_MOUNT_MARGIN },
		);
		observer.observe(element);

		return () => observer.disconnect();
	}, [ref]);

	return hasScrolledIntoView;
}

function customThemeChipStyle(
	customTheme: Patron["customTheme"],
): React.CSSProperties {
	return (customTheme ?? {}) as React.CSSProperties;
}
