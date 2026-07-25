import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	ANALYZER_URL,
	BUILDS_PAGE,
	CALENDAR_PAGE,
	FAQ_PAGE,
	LFG_PAGE,
	LUTI_PAGE,
	MATCH_PROFILE_PAGE,
	navIconUrl,
	OBJECT_DAMAGE_CALCULATOR_URL,
	SENDOUQ_PAGE,
	scrimsPage,
	TIERS_PAGE,
	VODS_PAGE,
	WELCOME_HERO_IMAGE_PATH,
} from "~/utils/urls";
import styles from "./welcome.module.css";

const SECTION_KEYS = [
	"whatDoINeed",
	"motionControls",
	"weapons",
	"builds",
	"mapsModes",
	"findingTeam",
	"noTeam",
	"haveTeam",
	"ranks",
	"divs",
	"plusServer",
] as const;

const PAGE_PILLS: Record<
	string,
	{ to: string; labelKey: string; navItem?: string }
> = {
	builds: {
		to: BUILDS_PAGE,
		labelKey: "common:pages.builds",
		navItem: "builds",
	},
	analyzer: {
		to: ANALYZER_URL,
		labelKey: "common:pages.analyzer",
		navItem: "analyzer",
	},
	"object-damage-calculator": {
		to: OBJECT_DAMAGE_CALCULATOR_URL,
		labelKey: "common:pages.object-damage-calculator",
		navItem: "object-damage-calculator",
	},
	lfg: {
		to: LFG_PAGE,
		labelKey: "common:pages.lfg",
		navItem: "lfg",
	},
	settings: {
		to: MATCH_PROFILE_PAGE,
		labelKey: "common:pages.settings",
		navItem: "settings",
	},
	calendar: {
		to: CALENDAR_PAGE,
		labelKey: "common:pages.calendar",
		navItem: "calendar",
	},
	vods: {
		to: VODS_PAGE,
		labelKey: "common:pages.vods",
		navItem: "vods",
	},
	sendouq: {
		to: SENDOUQ_PAGE,
		labelKey: "common:pages.sendouq",
		navItem: "sendouq",
	},
	scrims: {
		to: scrimsPage(),
		labelKey: "common:pages.scrims",
		navItem: "scrims",
	},
	tiers: {
		to: TIERS_PAGE,
		labelKey: "welcome:pills.tiers",
		navItem: "sendouq",
	},
	luti: {
		to: LUTI_PAGE,
		labelKey: "common:pages.luti",
		navItem: "luti",
	},
	faq: {
		to: FAQ_PAGE,
		labelKey: "common:pages.faq",
	},
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Welcome",
		description: "Guide to competitive Splatoon for new players",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "welcome",
};

export default function WelcomePage() {
	const { t } = useTranslation(["welcome"]);

	return (
		<Main className="stack lg">
			<figure className={styles.heroFigure}>
				<div className={styles.heroContainer}>
					<img
						src={WELCOME_HERO_IMAGE_PATH}
						alt=""
						className={styles.heroImg}
						width={3200}
						height={4000}
					/>
				</div>
				<figcaption className="text-xs text-lighter">
					{t("welcome:photoCredit")}
				</figcaption>
			</figure>
			<h1 className="text-xl">{t("welcome:title")}</h1>
			{SECTION_KEYS.map((sectionKey) => (
				<section key={sectionKey} className="stack sm">
					<h2 className="text-lg">
						{t(`welcome:${sectionKey}.header` as any)}
					</h2>
					{(t(`welcome:${sectionKey}.body` as any) as string)
						.split("\n\n")
						.map((paragraph) => (
							<ParagraphWithPagePills key={paragraph} text={paragraph} />
						))}
				</section>
			))}
		</Main>
	);
}

function ParagraphWithPagePills({ text }: { text: string }) {
	const parts = text.split(/>>([a-z-]+)<</);

	return (
		<p className={styles.paragraph}>
			{parts.map((part, i) => {
				if (i % 2 === 0) return part;

				return <PagePill key={part} slug={part} />;
			})}
		</p>
	);
}

function PagePill({ slug }: { slug: string }) {
	const { t } = useTranslation(["welcome", "common"]);
	const pill = PAGE_PILLS[slug];

	if (!pill) return <>{slug}</>;

	return (
		<Link to={pill.to} className={styles.pagePill}>
			{pill.navItem ? (
				<img
					src={`${navIconUrl(pill.navItem)}.avif`}
					width={16}
					height={16}
					alt=""
				/>
			) : null}
			{t(pill.labelKey as any)}
		</Link>
	);
}
