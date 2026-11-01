import clsx from "clsx";
import {
	EyeOff,
	Heart,
	MessageCircle,
	MessageSquareHeart,
	Repeat,
	Share,
	ThumbsUp,
	TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { Image } from "~/components/Image";
import { useIsStandalone } from "~/features/front-page/components/PWAInstallBanner";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { navIconUrl } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { ScoreBreakdown } from "../core/FeedRanking";
import {
	FEED_CATEGORIES,
	FEED_FEEDBACK_COMMENT_MAX_LENGTH,
	FEED_FEEDBACK_KINDS,
	FEED_ITEM_TYPES,
	type FeedFeedbackKind,
	type FeedItemTypeDefinition,
} from "../feed-constants";
import { feedItemActionSchema } from "../feed-schemas";
import { feedItemPage } from "../feed-urls";
import { communityItemContent } from "./CommunityItems";
import { creatorItemContent } from "./CreatorItems";
import styles from "./FeedItemCard.module.css";
import { durationText, relativeTime } from "./FeedParts";
import { playItemContent } from "./PlayItems";
import { teamItemContent } from "./TeamItems";
import { tournamentItemContent } from "./TournamentItems";

export interface FeedItemContent {
	avatar: React.ReactNode;
	line: React.ReactNode;
	body: React.ReactNode;
	/** How many reactions the post starts with */
	reactionCount?: number;
	/** Something the viewer can do right from the post */
	action?: { label: string; doneLabel: string };
}

const FEED_FEEDBACK_OPTIONS: Record<
	FeedFeedbackKind,
	{ label: string; icon: React.ReactNode; thanks: (typeName: string) => string }
> = {
	NOT_INTERESTING: {
		label: "Not interesting",
		icon: <EyeOff />,
		thanks: (typeName) => `You'll see fewer "${typeName}" posts.`,
	},
	TOO_OFTEN: {
		label: "Shows up too often",
		icon: <Repeat />,
		thanks: (typeName) => `"${typeName}" posts will show up less often.`,
	},
	MORE_LIKE_THIS: {
		label: "More like this",
		icon: <ThumbsUp />,
		thanks: (typeName) => `You'll see more "${typeName}" posts.`,
	},
	WRONG: {
		label: "Something's wrong with it",
		icon: <TriangleAlert />,
		thanks: () => "We'll take a look at what went wrong.",
	},
};

const INTERACTIVE_SELECTOR = "a, button, input, label, [role='menuitem']";

export function FeedItemCard({
	item,
	now,
	commentCount,
	href,
	headerAction,
	score,
}: {
	item: FeedItem;
	now: number;
	commentCount: number;
	/** Post page the card opens when clicked, none when already on it */
	href?: string;
	/** Shown at the end of the header line, e.g. a back link on the post page */
	headerAction?: React.ReactNode;
	score?: ScoreBreakdown;
}) {
	const navigate = useNavigate();
	const definition: FeedItemTypeDefinition = FEED_ITEM_TYPES[item.type];
	const source =
		definition.feature ??
		FEED_CATEGORIES.find((c) => c.id === definition.category)!;
	const content = itemContent(item, now);
	const [feedback, setFeedback] = React.useState<FeedFeedbackKind | null>(null);
	const [isDismissed, setIsDismissed] = React.useState(false);
	const isStandalone = useIsStandalone();
	const { submit } = useActionSubmit(feedItemActionSchema, {
		action: feedItemPage(item.type),
	});

	if (definition.isHiddenInPwa && isStandalone) return null;
	if (isDismissed) return null;

	const sendFeedback = (kind: FeedFeedbackKind, comment: string | null) => {
		setFeedback(kind);
		submit("FEEDBACK", { itemAt: item.at, kind, comment });
	};

	if (feedback) {
		return (
			<FeedbackPanel
				thanks={FEED_FEEDBACK_OPTIONS[feedback].thanks(definition.name)}
				onSendComment={(comment) => sendFeedback(feedback, comment)}
				onUndo={() => {
					setFeedback(null);
					submit("DELETE_FEEDBACK", { itemAt: item.at });
				}}
				onDismiss={() => setIsDismissed(true)}
			/>
		);
	}

	const openPost = (event: React.MouseEvent<HTMLElement>) => {
		if (!href) return;

		const target = event.target as HTMLElement;
		const isOwnClick =
			event.currentTarget.contains(target) &&
			!target.closest(INTERACTIVE_SELECTOR);
		const isSelectingText = Boolean(window.getSelection()?.toString());
		if (!isOwnClick || isSelectingText) return;

		navigate(href);
	};

	return (
		<article
			className={clsx(styles.post, { [styles.postLinked]: Boolean(href) })}
			onClick={openPost}
		>
			<div className={styles.avatar}>{content.avatar}</div>
			<div className={styles.main}>
				<div className={styles.meta}>
					<Image
						path={navIconUrl(source.navIcon)}
						alt=""
						size={16}
						containerClassName={styles.metaIcon}
					/>
					<span className={styles.community}>{source.label}</span>
					<span aria-hidden>·</span>
					{href ? (
						<Link to={href} className={styles.time}>
							{relativeTime(item.at, now)}
						</Link>
					) : (
						<span>{relativeTime(item.at, now)}</span>
					)}
					<div className={styles.metaEnd}>
						{definition.isRetimed ? (
							<span className={styles.retimed} title="Real rows shifted to now">
								re-timed
							</span>
						) : null}
						<FeedbackMenu onFeedback={(kind) => sendFeedback(kind, null)} />
						{headerAction ? (
							<div className={styles.headerAction}>{headerAction}</div>
						) : null}
					</div>
				</div>
				<p className={styles.text}>{content.line}</p>
				{content.body ? (
					<div className={styles.body}>{content.body}</div>
				) : null}
				{content.action ? <PostAction action={content.action} /> : null}
				<PostActions
					reactionCount={content.reactionCount ?? 0}
					commentCount={commentCount}
					href={href}
				/>
				{score ? <RankingMath score={score} definition={definition} /> : null}
			</div>
		</article>
	);
}

function PostAction({
	action,
}: {
	action: NonNullable<FeedItemContent["action"]>;
}) {
	const [isDone, setIsDone] = React.useState(false);

	return (
		<SendouButton
			size="small"
			variant={isDone ? "outlined" : undefined}
			isDisabled={isDone}
			onClick={() => setIsDone(true)}
			className={styles.postAction}
		>
			{isDone ? action.doneLabel : action.label}
		</SendouButton>
	);
}

function PostActions({
	reactionCount,
	commentCount,
	href,
}: {
	reactionCount: number;
	commentCount: number;
	href?: string;
}) {
	const [isReacted, setIsReacted] = React.useState(false);
	const count = reactionCount + (isReacted ? 1 : 0);

	return (
		<footer className={styles.actions}>
			{href ? (
				<Link to={href} className={styles.action} aria-label="Comments">
					<MessageCircle size={17} />
					{commentCount > 0 ? commentCount : null}
				</Link>
			) : (
				<span className={clsx(styles.action, styles.actionStatic)}>
					<MessageCircle size={17} />
					{commentCount > 0 ? commentCount : null}
				</span>
			)}
			<button
				type="button"
				className={clsx(styles.action, {
					[styles.reacted]: isReacted,
				})}
				aria-label="Booyah"
				aria-pressed={isReacted}
				onClick={() => setIsReacted(!isReacted)}
			>
				<Heart size={17} fill={isReacted ? "currentColor" : "none"} />
				{count > 0 ? count : null}
			</button>
			<button type="button" className={styles.action} aria-label="Share">
				<Share size={17} />
			</button>
		</footer>
	);
}

function FeedbackMenu({
	onFeedback,
}: {
	onFeedback: (kind: FeedFeedbackKind) => void;
}) {
	return (
		<SendouMenu
			placement="bottom end"
			trigger={
				<button type="button" className={styles.feedbackTrigger}>
					<MessageSquareHeart size={14} />
					Feedback
				</button>
			}
		>
			{FEED_FEEDBACK_KINDS.map((kind) => (
				<SendouMenuItem
					key={kind}
					icon={FEED_FEEDBACK_OPTIONS[kind].icon}
					onAction={() => onFeedback(kind)}
				>
					{FEED_FEEDBACK_OPTIONS[kind].label}
				</SendouMenuItem>
			))}
		</SendouMenu>
	);
}

function FeedbackPanel({
	thanks,
	onSendComment,
	onUndo,
	onDismiss,
}: {
	thanks: string;
	onSendComment: (comment: string) => void;
	onUndo: () => void;
	onDismiss: () => void;
}) {
	const [comment, setComment] = React.useState("");
	const [isSent, setIsSent] = React.useState(false);

	return (
		<article className={clsx(styles.post, styles.postFeedback)}>
			<MessageSquareHeart size={20} className={styles.feedbackIcon} />
			<div className={styles.feedbackText}>
				<b>Thanks for the feedback.</b> {thanks}
			</div>
			<SendouButton size="small" variant="outlined" onClick={onUndo}>
				Undo
			</SendouButton>
			<div className={styles.feedbackComment}>
				{isSent ? (
					<p className={styles.feedbackSent}>
						Comment sent. It helps us make the feed better!
					</p>
				) : (
					<textarea
						className={styles.feedbackCommentInput}
						value={comment}
						maxLength={FEED_FEEDBACK_COMMENT_MAX_LENGTH}
						placeholder="Anything else? Tell us what you think about this post or the feed in general (optional)"
						aria-label="Feedback comment"
						onChange={(event) => setComment(event.target.value)}
					/>
				)}
				<div className={styles.feedbackActions}>
					{isSent ? null : (
						<SendouButton
							size="small"
							isDisabled={!comment.trim()}
							onClick={() => {
								onSendComment(comment.trim());
								setIsSent(true);
							}}
						>
							Send
						</SendouButton>
					)}
					<SendouButton size="small" variant="outlined" onClick={onDismiss}>
						Dismiss
					</SendouButton>
				</div>
			</div>
		</article>
	);
}

function RankingMath({
	score,
	definition,
}: {
	score: ScoreBreakdown;
	definition: FeedItemTypeDefinition;
}) {
	return (
		<div className={styles.math}>
			<b>{definition.name}</b>: base <b>{score.base}</b> × affinity{" "}
			<b>{score.affinity}</b> × recency <b>{score.recency.toFixed(2)}</b> (
			{durationText(score.ageHours * 3600)} old, half-life{" "}
			{definition.halfLifeHours}h) × diversity{" "}
			<b>{score.diversity.toFixed(2)}</b> = <b>{score.total.toFixed(3)}</b>
		</div>
	);
}

function itemContent(item: FeedItem, now: number): FeedItemContent {
	return (
		playItemContent(item) ??
		tournamentItemContent(item, now) ??
		teamItemContent(item) ??
		creatorItemContent(item) ??
		communityItemContent(item, now) ?? {
			avatar: null,
			line: item.type,
			body: null,
		}
	);
}
