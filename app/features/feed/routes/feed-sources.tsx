import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { navIconUrl } from "~/utils/urls";
import {
	FEED_ITEM_TYPES,
	type FeedItemTypeDefinition,
} from "../feed-constants";
import {
	FEED_SOURCE_FEATURES,
	FEED_SOURCE_NONE,
	type FeedSource,
	type FeedSourceAlgorithm,
	type FeedSourceAudience,
	type FeedSourceFeature,
	type FeedSourcePlacement,
	type ProposedFeedItem,
} from "../feed-sources-constants";
import styles from "./feed-sources.module.css";

const AUDIENCE_LABELS: Record<FeedSourceAudience, string> = {
	SELF: "You",
	TEAM: "Your team",
	FRIENDS: "Friends",
	FOLLOWING: "Following",
	NETWORK: "Friends of friends",
	EVERYONE: "Everyone",
	LFG: "Others looking (LFG)",
	ASSOCIATION: "Association members",
	PLUS_TIER: "Plus tier members",
};

const PLACEMENT_LABELS: Record<FeedSourcePlacement, string> = {
	FEED: "Feed",
	PINNED: "Pinned",
	LIVE: "Live strip",
};

const LEGEND_AUDIENCES: FeedSourceAudience[] = [
	"SELF",
	"TEAM",
	"FRIENDS",
	"FOLLOWING",
	"NETWORK",
	"EVERYONE",
	"LFG",
];

export default function FeedSourcesPage() {
	const allSources = FEED_SOURCE_FEATURES.flatMap((feature) => feature.sources);
	const prototypeCount = allSources.filter(
		(source) => typeof source.item === "string",
	).length;

	return (
		<Main className={styles.page}>
			<header className="stack sm">
				<h1 className={styles.title}>Feed sources</h1>
				<p className={styles.lede}>
					Every feature and the feed items it could create: when each one
					appears, who sees it and what the post would say.{" "}
					<b>{allSources.length} item types</b> from{" "}
					<b>{FEED_SOURCE_FEATURES.length} features</b>. {prototypeCount} are
					already on <Link to="/feed-test">/feed-test</Link>, the other{" "}
					{allSources.length - prototypeCount} are new ideas. Example names are
					fictional.
				</p>
			</header>
			<div className={styles.legend}>
				<div className={styles.legendBox}>
					<h2 className={styles.legendTitle}>Placement</h2>
					<div className={styles.tags}>
						{(Object.keys(PLACEMENT_LABELS) as FeedSourcePlacement[]).map(
							(placement) => (
								<PlacementTag key={placement} placement={placement} />
							),
						)}
					</div>
					<p className={styles.legendText}>
						Feed items are ranked. Pinned items are things you need to act on,
						shown above the feed. The live strip shows what's happening right
						now. Some items also have an action button right on the post.
					</p>
				</div>
				<div className={styles.legendBox}>
					<h2 className={styles.legendTitle}>Seen by</h2>
					<div className={styles.tags}>
						{LEGEND_AUDIENCES.map((audience) => (
							<span key={audience} className={styles.audience}>
								{AUDIENCE_LABELS[audience]}
							</span>
						))}
					</div>
					<p className={styles.legendText}>
						Following assumes a follow feature for players, teams, orgs and
						artists, which doesn't exist yet.
					</p>
				</div>
			</div>
			<nav className={styles.index} aria-label="Features">
				{FEED_SOURCE_FEATURES.map((feature) => (
					<a key={feature.name} href={`#${featureAnchor(feature.name)}`}>
						{feature.name}
						<span className="text-lighter">{feature.sources.length}</span>
					</a>
				))}
				<a href="#no-feed-items">
					No feed items
					<span className="text-lighter">{FEED_SOURCE_NONE.length}</span>
				</a>
			</nav>
			{FEED_SOURCE_FEATURES.map((feature) => (
				<FeatureSection key={feature.name} feature={feature} />
			))}
			<section id="no-feed-items" className={styles.feature}>
				<header className={styles.featureHeader}>
					<h2 className={styles.featureName}>No feed items</h2>
				</header>
				<ul className={styles.noneList}>
					{FEED_SOURCE_NONE.map((none) => (
						<li key={none.name}>
							<b>{none.name}</b>
							<span className="text-lighter">{none.reason}</span>
						</li>
					))}
				</ul>
			</section>
		</Main>
	);
}

function FeatureSection({ feature }: { feature: FeedSourceFeature }) {
	const newCount = feature.sources.filter(
		(source) => typeof source.item !== "string",
	).length;

	return (
		<section id={featureAnchor(feature.name)} className={styles.feature}>
			<header className={styles.featureHeader}>
				{feature.navIcon ? (
					<Image path={navIconUrl(feature.navIcon)} alt="" size={32} />
				) : null}
				<h2 className={styles.featureName}>{feature.name}</h2>
				<span className="text-xs text-lighter">
					{feature.sources.length} item
					{feature.sources.length === 1 ? "" : "s"}
					{newCount > 0 ? ` · ${newCount} new` : ""}
				</span>
			</header>
			{feature.note ? (
				<p className={clsx(styles.note, "text-lighter")}>{feature.note}</p>
			) : null}
			{feature.algorithm ? (
				<AlgorithmBox algorithm={feature.algorithm} />
			) : null}
			<ul className={styles.sources}>
				{feature.sources.map((source) => (
					<SourceCard key={sourceDetails(source).key} source={source} />
				))}
			</ul>
		</section>
	);
}

function SourceCard({ source }: { source: FeedSource }) {
	const details = sourceDetails(source);

	return (
		<li className={styles.source}>
			<div className={styles.sourceHeader}>
				<h3 className={styles.sourceName}>{details.name}</h3>
				<PlacementTag placement={details.placement} />
				<span
					className={clsx(
						styles.tag,
						details.isInPrototype ? styles.tagPrototype : styles.tagNew,
					)}
				>
					{details.isInPrototype ? "In prototype" : "New idea"}
				</span>
				<code className={styles.key}>{details.key}</code>
			</div>
			<dl className={styles.facts}>
				<dt>When</dt>
				<dd>{source.when}</dd>
				<dt>Seen by</dt>
				<dd className={styles.tags}>
					{details.audience.map((audience) => (
						<span key={audience} className={styles.audience}>
							{AUDIENCE_LABELS[audience]}
						</span>
					))}
				</dd>
				{source.action ? (
					<>
						<dt>Action</dt>
						<dd>
							<span className={styles.actionButton}>{source.action}</span>
						</dd>
					</>
				) : null}
				<dt>Example</dt>
				<dd>
					<div className={styles.examplePost}>
						<Avatar identiconInput={source.example.actor} size="xxsm" />
						<p>
							{source.example.text
								.split("**")
								.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part))}
						</p>
					</div>
				</dd>
			</dl>
		</li>
	);
}

function AlgorithmBox({ algorithm }: { algorithm: FeedSourceAlgorithm }) {
	return (
		<div className={styles.algorithm}>
			<h3 className={styles.algorithmTitle}>How items are picked</h3>
			<dl className={styles.facts}>
				<dt>Gate</dt>
				<dd>{algorithm.gate}</dd>
				<dt>Signals</dt>
				<dd>
					<div className={styles.signalsWrap}>
						<table className={styles.signals}>
							<thead>
								<tr>
									<th>Signal</th>
									<th>Measured from</th>
									<th>Scoring</th>
								</tr>
							</thead>
							<tbody>
								{algorithm.signals.map((signal) => (
									<tr key={signal.name}>
										<th scope="row">{signal.name}</th>
										<td data-label="Measured from">{signal.measure}</td>
										<td data-label="Scoring">{signal.scoring}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</dd>
				<dt>Decision</dt>
				<dd>{algorithm.decision}</dd>
				{algorithm.workedExample ? (
					<>
						<dt>Example</dt>
						<dd className={styles.workedExample}>{algorithm.workedExample}</dd>
					</>
				) : null}
				{algorithm.openQuestions ? (
					<>
						<dt>Open</dt>
						<dd>
							<ul className={styles.openQuestions}>
								{algorithm.openQuestions.map((question) => (
									<li key={question}>{question}</li>
								))}
							</ul>
						</dd>
					</>
				) : null}
			</dl>
		</div>
	);
}

function PlacementTag({ placement }: { placement: FeedSourcePlacement }) {
	return (
		<span
			className={clsx(styles.tag, {
				[styles.tagFeed]: placement === "FEED",
				[styles.tagPinned]: placement === "PINNED",
				[styles.tagLive]: placement === "LIVE",
			})}
		>
			{PLACEMENT_LABELS[placement]}
		</span>
	);
}

function sourceDetails(source: FeedSource): ProposedFeedItem & {
	isInPrototype: boolean;
} {
	if (typeof source.item !== "string") {
		return { ...source.item, isInPrototype: false };
	}

	const definition: FeedItemTypeDefinition = FEED_ITEM_TYPES[source.item];

	return {
		key: source.item,
		name: definition.name,
		audience: definition.audience,
		placement: definition.isPinned
			? "PINNED"
			: definition.isLive
				? "LIVE"
				: "FEED",
		isInPrototype: true,
	};
}

function featureAnchor(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
