import { formatDistance } from "date-fns";
import { z } from "zod";
import { logger } from "~/utils/logger";

const BSKY_URL =
	"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did:plc:3hjmoa7vbx6bsqc3n2vu54v3&filter=posts_no_replies'";

const CHANGE_LOG_ITEMS_MAX = 6;

const postsSchema = z.object({
	feed: z.array(
		z.object({
			post: z.object({
				uri: z.string(),
				record: z.object({
					$type: z.string(),
					createdAt: z.string(),
					facets: z
						.array(
							z.object({
								features: z.array(
									z.object({ $type: z.string(), tag: z.string().nullish() }),
								),
								index: z.object({ byteEnd: z.number(), byteStart: z.number() }),
							}),
						)
						.nullish(),
					text: z.string(),
				}),
				embed: z
					.object({
						$type: z.string(),
						images: z
							.array(
								z.object({
									thumb: z.string(),
									fullsize: z.string(),
									alt: z.string(),
									aspectRatio: z.object({
										height: z.number(),
										width: z.number(),
									}),
								}),
							)
							.nullish(),
					})
					.nullish(),
				replyCount: z.number(),
				repostCount: z.number(),
				likeCount: z.number(),
				quoteCount: z.number(),
			}),
		}),
	),
});

export async function get() {
	let result: ChangelogItem[];
	try {
		const data = await fetchPosts();
		result = parsePosts(data)
			.filter(postHasSendouInkTag)
			.map(rawPostToChangelogItem)
			.slice(0, CHANGE_LOG_ITEMS_MAX);
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		logger.error(`Failed to get changelog: ${error.message}`);
		return [];
	}

	return result;
}

type RawPost = z.infer<typeof postsSchema>["feed"][number]["post"];

export interface ChangelogItem {
	id: string;
	text: string;
	createdAtRelative: string;
	postUrl: string;
	images: {
		thumb: string;
		fullsize: string;
		aspectRatio: {
			height: number;
			width: number;
		};
	}[];
	stats: {
		likes: number;
		reposts: number;
		replies: number;
	};
}

async function fetchPosts() {
	// returns 50 post (default) can be increased to 100
	const response = await fetch(BSKY_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch posts: ${response.statusText}`);
	}

	const json = await response.json();
	return json as unknown;
}

function parsePosts(data: unknown) {
	const result = postsSchema.safeParse(data);
	if (!result.success) {
		throw new Error(`Failed to parse posts: ${result.error.message}`);
	}

	return result.data.feed.map((feed) => feed.post);
}

function postHasSendouInkTag(post: RawPost) {
	return post.record.facets?.some((facet) =>
		facet.features.some(
			(feature) => feature.tag?.toLowerCase() === "sendouink",
		),
	);
}

function rawPostToChangelogItem(post: RawPost): ChangelogItem {
	return {
		id: post.uri,
		text: post.record.text.replace("#sendouink", "").trim(),
		createdAtRelative: formatDistance(
			new Date(post.record.createdAt),
			new Date(),
			{
				addSuffix: true,
			},
		),
		postUrl: `https://bsky.app/profile/did:plc:3hjmoa7vbx6bsqc3n2vu54v3/post/${post.uri.split("/").pop()}`,
		images:
			post.embed?.images?.map((image) => ({
				thumb: image.thumb,
				fullsize: image.fullsize,
				aspectRatio: image.aspectRatio,
			})) ?? [],
		stats: {
			likes: post.likeCount,
			reposts: post.repostCount + post.quoteCount,
			replies: post.replyCount,
		},
	};
}
