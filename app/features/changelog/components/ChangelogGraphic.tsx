import clsx from "clsx";
import type * as React from "react";
import { Image } from "~/components/Image";
import {
	GraphicContainer,
	GraphicDateSubtitle,
	GraphicHeader,
	GraphicSectionDivider,
	GraphicTitle,
} from "~/features/img-export/components/Graphic";
import { navIconUrl, type OgImagePage } from "~/utils/urls";
import styles from "./ChangelogGraphic.module.css";

const GRAPHIC_WIDTH = 560;

export interface ChangelogGraphicEntry {
	/** Nav icons shown next to the entry; omitted = sendou.ink logo */
	navItems?: OgImagePage[];
	type: "feature" | "bug";
	headline: string;
	bullets?: string[];
}

export function ChangelogGraphic({
	date,
	entries,
}: {
	date: Date;
	entries: ChangelogGraphicEntry[];
}) {
	const longFeatures = entries.filter(
		(entry) => entry.type === "feature" && (entry.bullets?.length ?? 0) > 0,
	);
	const shortFeatures = entries.filter(
		(entry) => entry.type === "feature" && !entry.bullets?.length,
	);
	const fixes = entries.filter((entry) => entry.type === "bug");

	return (
		<div
			className={styles.wrapper}
			data-theme="dark"
			data-default-theme
			data-changelog-canvas
		>
			<GraphicContainer width={GRAPHIC_WIDTH}>
				<GraphicHeader
					leading={<SiteLogoMark className={styles.logoHeader} />}
					titleRow={
						<GraphicTitle>
							sendou<span className={styles.titleAccent}>.ink</span> update
						</GraphicTitle>
					}
					subtitle={<GraphicDateSubtitle date={date} />}
				/>
				<div className={styles.entries}>
					{longFeatures.map((entry) => (
						<LongFeature key={entry.headline} entry={entry} />
					))}
					{shortFeatures.map((entry) => (
						<div key={entry.headline} className={styles.shortFeature}>
							<EntryIcons entry={entry} size={28} />
							{entry.headline}
						</div>
					))}
					{fixes.length > 0 ? (
						<>
							<GraphicSectionDivider>Fixes</GraphicSectionDivider>
							{fixes.map((entry) => (
								<div key={entry.headline} className={styles.fix}>
									<EntryIcons entry={entry} size={22} />
									{entry.headline}
								</div>
							))}
						</>
					) : null}
				</div>
			</GraphicContainer>
		</div>
	);
}

function LongFeature({ entry }: { entry: ChangelogGraphicEntry }) {
	return (
		<section className={styles.longFeature}>
			<div className={styles.longFeatureHeader}>
				<EntryIcons entry={entry} size={36} />
				<h2 className={styles.longFeatureHeadline}>{entry.headline}</h2>
			</div>
			<ul className={styles.bullets}>
				{entry.bullets?.map((bullet) => (
					<li key={bullet}>{bullet}</li>
				))}
			</ul>
		</section>
	);
}

function EntryIcons({
	entry,
	size,
}: {
	entry: ChangelogGraphicEntry;
	size: number;
}) {
	if (!entry.navItems) {
		return <SiteLogoMark style={{ fontSize: size / 2.25 }} />;
	}

	return (
		<div className={styles.entryIcons}>
			{entry.navItems.map((navItem) => (
				<Image
					key={navItem}
					path={navIconUrl(navItem)}
					alt=""
					size={size}
					containerClassName={styles.entryIcon}
					loading="eager"
				/>
			))}
		</div>
	);
}

function SiteLogoMark({
	className,
	style,
}: {
	className?: string;
	style?: React.CSSProperties;
}) {
	return (
		<div className={clsx(styles.logo, className)} style={style}>
			<span className={styles.logoS}>S</span>
			<span className={styles.logoInk}>ink</span>
		</div>
	);
}
