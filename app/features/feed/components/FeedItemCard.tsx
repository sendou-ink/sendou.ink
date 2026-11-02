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
import { toastQueue } from "~/components/elements/Toast";
import { Image } from "~/components/Image";
import { useUser } from "~/features/auth/core/user";
import { sendFriendRequestBaseSchema } from "~/features/friends/friends-schemas";
import { useIsStandalone } from "~/features/front-page/components/PWAInstallBanner";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { FRIENDS_PAGE, navIconUrl } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedItemInteractions } from "../core/FeedPage.server";
import type { ScoreBreakdown } from "../core/FeedRanking";
import {
	FEED_CATEGORIES,
	FEED_FEEDBACK_COMMENT_MAX_LENGTH,
	FEED_FEEDBACK_KINDS,
	FEED_ITEM_TYPES,
	type FeedFeedbackKind,
	type FeedItemTypeDefinition,
	type FeedRelation,
} from "../feed-constants";
import { feedItemActionSchema } from "../feed-schemas";
import { type FeedItemPageState, feedItemPage } from "../feed-urls";
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
	/** What a notice post opens when clicked, see `isNotice` */
	href?: string;
	/** Something the viewer can do right from the post */
	action?: FeedPostAction;
}

type FeedPostAction = { type: "SEND_FRIEND_REQUEST"; userId: number };

const POST_ACTION_LABELS: Record<
	FeedPostAction["type"],
	{ label: string; doneLabel: string }
> = {
	SEND_FRIEND_REQUEST: {
		label: "Add friend",
		doneLabel: "Friend request sent",
	},
};

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

const FROM_FEED_STATE: FeedItemPageState = { fromFeed: true };

const INTERACTIVE_SELECTOR = "a, button, input, label, [role='menuitem']";

export function FeedItemCard({
	item,
	now,
	interactions,
	sharerId,
	href,
	headerAction,
	score,
}: {
	item: FeedItem;
	now: number;
	interactions: FeedItemInteractions;
	/** Whose feed the post is from, the share link shows it as they see it */
	sharerId: number;
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
		action: feedItemPage(item.id),
	});

	const openHref = definition.isNotice ? content.href : href;
	const openState = definition.isNotice ? undefined : FROM_FEED_STATE;

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
		if (!openHref) return;

		const target = event.target as HTMLElement;
		const isOwnClick =
			event.currentTarget.contains(target) &&
			!target.closest(INTERACTIVE_SELECTOR);
		const isSelectingText = Boolean(window.getSelection()?.toString());
		if (!isOwnClick || isSelectingText) return;

		navigate(openHref, { state: openState });
	};

	return (
		<article
			className={clsx(styles.post, {
				[styles.postLinked]: Boolean(openHref),
				[styles.postNotice]: definition.isNotice,
			})}
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
					{openHref ? (
						<Link to={openHref} state={openState} className={styles.time}>
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
				{definition.isNotice ? null : (
					<PostActions
						itemId={item.id}
						interactions={interactions}
						sharerId={sharerId}
						href={href}
					/>
				)}
				{score ? (
					<RankingMath
						score={score}
						definition={definition}
						relation={item.relation}
					/>
				) : null}
			</div>
		</article>
	);
}

function PostAction({ action }: { action: FeedPostAction }) {
	const user = useUser();
	const { submit, state } = useActionSubmit(sendFriendRequestBaseSchema, {
		action: FRIENDS_PAGE,
	});
	const [isSent, setIsSent] = React.useState(false);
	const isDone = isSent && state === "idle";
	const labels = POST_ACTION_LABELS[action.type];

	if (!user) return null;

	return (
		<SendouButton
			size="small"
			variant={isDone ? "outlined" : undefined}
			isDisabled={isSent}
			onClick={() => {
				setIsSent(true);
				submit("SEND_REQUEST", { userId: action.userId });
			}}
			className={styles.postAction}
		>
			{isDone ? labels.doneLabel : labels.label}
		</SendouButton>
	);
}

function PostActions({
	itemId,
	interactions,
	sharerId,
	href,
}: {
	itemId: string;
	interactions: FeedItemInteractions;
	sharerId: number;
	href?: string;
}) {
	const user = useUser();
	const { submit, fetcher } = useActionSubmit(feedItemActionSchema, {
		action: feedItemPage(itemId),
	});
	const pendingAction = fetcher.formData?.get("_action");
	const isReacted = pendingAction
		? pendingAction === "REACT"
		: interactions.isReacted;
	const count =
		interactions.reactionCount -
		(interactions.isReacted ? 1 : 0) +
		(isReacted ? 1 : 0);
	const { commentCount } = interactions;

	const share = async () => {
		const url = new URL(
			feedItemPage(itemId, {
				sharedBy: sharerId,
				token: interactions.shareToken,
			}),
			window.location.origin,
		).toString();

		if (navigator.share) {
			try {
				await navigator.share({ url });
			} catch {}
			return;
		}

		try {
			await navigator.clipboard.writeText(url);
			toastQueue.add(
				{ message: "Link copied", variant: "success" },
				{ timeout: 3000 },
			);
		} catch {}
	};

	return (
		<footer className={styles.actions}>
			{href ? (
				<Link
					to={href}
					state={FROM_FEED_STATE}
					className={styles.action}
					aria-label="Comments"
				>
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
				disabled={!user}
				onClick={() => submit(isReacted ? "UNREACT" : "REACT")}
			>
				<Heart size={17} fill={isReacted ? "currentColor" : "none"} />
				{count > 0 ? count : null}
			</button>
			<button
				type="button"
				className={styles.action}
				aria-label="Share"
				onClick={share}
			>
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
	relation,
}: {
	score: ScoreBreakdown;
	definition: FeedItemTypeDefinition;
	relation: FeedRelation | null;
}) {
	return (
		<div className={styles.math}>
			<b>{definition.name}</b>: base <b>{score.base}</b> × affinity{" "}
			<b>{score.affinity}</b>
			{relation ? ` (${relation.toLowerCase()})` : null} × recency{" "}
			<b>{score.recency.toFixed(2)}</b> ({durationText(score.ageHours * 3600)}{" "}
			old, half-life {definition.halfLifeHours}h) × diversity{" "}
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
