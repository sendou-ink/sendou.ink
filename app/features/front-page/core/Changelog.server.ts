import { formatDistance } from "date-fns";
import * as v from "valibot";
import { logger } from "~/utils/logger";

const BSKY_URL =
	"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did:plc:3hjmoa7vbx6bsqc3n2vu54v3&filter=posts_no_replies'";

const CHANGE_LOG_ITEMS_MAX = 6;

const postsSchema = v.object({
	feed: v.array(
		v.object({
			post: v.object({
				uri: v.string(),
				record: v.object({
					$type: v.string(),
					createdAt: v.string(),
					facets: v.optional(
						v.nullable(
							v.array(
								v.object({
									features: v.array(
										v.object({
											$type: v.string(),
											tag: v.nullish(v.string()),
										}),
									),
									index: v.object({
										byteEnd: v.number(),
										byteStart: v.number(),
									}),
								}),
							),
						),
					),
					text: v.string(),
				}),
				embed: v.optional(
					v.nullable(
						v.object({
							$type: v.string(),
							images: v.optional(
								v.nullable(
									v.array(
										v.object({
											thumb: v.string(),
											fullsize: v.string(),
											alt: v.string(),
											aspectRatio: v.object({
												height: v.number(),
												width: v.number(),
											}),
										}),
									),
								),
							),
						}),
					),
				),
				replyCount: v.number(),
				repostCount: v.number(),
				likeCount: v.number(),
				quoteCount: v.number(),
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

type RawPost = v.InferOutput<typeof postsSchema>["feed"][number]["post"];

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
	const result = v.safeParse(postsSchema, data);
	if (!result.success) {
		throw new Error(`Failed to parse posts: ${v.summarize(result.issues)}`);
	}

	return result.output.feed.map((feed) => feed.post);
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
