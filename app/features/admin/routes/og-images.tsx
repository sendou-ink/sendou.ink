import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { navIconUrl, OG_IMAGE_PAGES, type OgImagePage } from "~/utils/urls";
import styles from "./og-images.module.css";

// not accessible in production, previews per page OG images

type IconColor = "pink" | "cyan" | "green";

/** Accent (blobs, sticker shadow, ring) and second accent (top blob), matching the nav icon's two main ink colors. */
const PAGE_COLORS: Record<
	OgImagePage,
	{ accent: IconColor; second: IconColor }
> = {
	settings: { accent: "pink", second: "cyan" },
	sendouq: { accent: "green", second: "pink" },
	analyzer: { accent: "cyan", second: "pink" },
	"comp-analyzer": { accent: "pink", second: "green" },
	builds: { accent: "cyan", second: "pink" },
	"object-damage-calculator": { accent: "cyan", second: "pink" },
	leaderboards: { accent: "cyan", second: "green" },
	scrims: { accent: "pink", second: "green" },
	lfg: { accent: "green", second: "pink" },
	plans: { accent: "pink", second: "green" },
	trophies: { accent: "cyan", second: "pink" },
	calendar: { accent: "pink", second: "green" },
	plus: { accent: "cyan", second: "green" },
	xsearch: { accent: "cyan", second: "pink" },
	articles: { accent: "pink", second: "cyan" },
	vods: { accent: "pink", second: "green" },
	art: { accent: "pink", second: "cyan" },
	"tier-list-maker": { accent: "pink", second: "cyan" },
	links: { accent: "green", second: "pink" },
	maps: { accent: "green", second: "pink" },
};

export default function OgImages() {
	const { t } = useTranslation(["common"]);

	return (
		<Main className="stack lg" bigger>
			<div className="stack sm">
				<h1>OG Images</h1>
				<div className="text-sm text-lighter">
					Rendered at the real 1200x630 size.
				</div>
			</div>
			<Divider smallText className="text-uppercase text-xs font-bold">
				Default (front page & pages without their own)
			</Divider>
			<div className={styles.grid}>
				<PreviewCard label="default.png">
					<MarqueeRowsOg />
				</PreviewCard>
			</div>
			<Divider smallText className="text-uppercase text-xs font-bold">
				Pages
			</Divider>
			<div className={styles.grid}>
				{OG_IMAGE_PAGES.map((page) => (
					<PreviewCard key={page} label={`${page}.png`}>
						<PageOg page={page} title={t(`common:pages.${page}` as any)} />
					</PreviewCard>
				))}
			</div>
		</Main>
	);
}

function PreviewCard({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="stack sm">
			<div className={styles.frame}>{children}</div>
			<div className="text-xs text-lighter">{label}</div>
		</div>
	);
}

/** Tilted rows of icons as a backdrop, wordmark punched through the middle. */
function MarqueeRowsOg() {
	const { t } = useTranslation(["common"]);

	return (
		<Canvas name="default">
			<div className={styles.rowsBlock}>
				{[0, 1, 2, 3].map((row) => (
					<div key={row} className={styles.rowsRow}>
						{OG_IMAGE_PAGES.slice(row * 5, row * 5 + 5).map((page) => (
							<Image
								key={page}
								path={navIconUrl(page)}
								alt=""
								width={150}
								height={150}
								loading="eager"
							/>
						))}
					</div>
				))}
			</div>
			<div className={styles.rowsScrim} />
			<div className={styles.brand}>
				<div className={styles.brandName}>
					sendou<span className={styles.brandInk}>.ink</span>
				</div>
				<div className={styles.brandTagline}>{t("common:websiteSubtitle")}</div>
			</div>
		</Canvas>
	);
}

function PageOg({ page, title }: { page: OgImagePage; title: string }) {
	const { accent, second } = PAGE_COLORS[page];

	return (
		<Canvas
			name={page}
			className={styles.pageCanvas}
			accent={accent}
			second={second}
		>
			<div className={styles.iconArea}>
				<div className={styles.ring} />
				<Image
					path={navIconUrl(page)}
					alt=""
					width={324}
					height={324}
					containerClassName={styles.icon}
					className={styles.fillImage}
					loading="eager"
				/>
			</div>
			<div className={styles.text}>
				<div className={styles.wordmark}>sendou.ink</div>
				<div className={styles.title} data-size={titleSize(title)}>
					{title}
				</div>
			</div>
			<div className={clsx(styles.blob, styles.blobTop)} />
			<div className={clsx(styles.blob, styles.blobMiddle)} />
			<div className={clsx(styles.blob, styles.blobBottom)} />
		</Canvas>
	);
}

function Canvas({
	name,
	className,
	accent,
	second,
	children,
}: {
	/** File name the generator script writes this canvas to. */
	name: string;
	className?: string;
	accent?: IconColor;
	second?: IconColor;
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.canvas, className)}
			data-theme="dark"
			data-default-theme
			data-og-name={name}
			data-accent={accent}
			data-second={second}
		>
			{children}
		</div>
	);
}

function titleSize(title: string) {
	if (title.length > 14) return "small";
	if (title.length > 9) return "medium";

	return "large";
}
