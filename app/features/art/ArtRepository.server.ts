import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { seededRandom } from "~/utils/random";
import type { ListedArt } from "./art-types";

export function unlinkUserFromArt({
	userId,
	artId,
}: {
	userId: number;
	artId: number;
}) {
	return db
		.deleteFrom("ArtUserMetadata")
		.where("artId", "=", artId)
		.where("userId", "=", userId)
		.execute();
}

function getDailySeed() {
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const day = today.getDate();
	return `${year}-${month}-${day}`;
}

export async function findShowcaseArts(): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom("Art")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select([
			"Art.id",
			"Art.createdAt",
			"User.id as userId",
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			"UserSubmittedImage.url",
		])
		.orderBy("Art.isShowcase", "desc")
		.orderBy("Art.createdAt", "desc")
		.orderBy("User.id", "asc")
		.execute();

	const encounteredUserIds = new Set<number>();

	const mappedArts = arts
		.filter((row) => {
			if (encounteredUserIds.has(row.userId)) {
				return false;
			}

			encounteredUserIds.add(row.userId);

			return true;
		})
		.map((a) => ({
			id: a.id,
			createdAt: a.createdAt,
			url: a.url,
			author: {
				commissionsOpen: a.commissionsOpen,
				discordAvatar: a.discordAvatar,
				discordId: a.discordId,
				username: a.username,
			},
		}));

	const { seededShuffle } = seededRandom(getDailySeed());
	return seededShuffle(mappedArts);
}

export async function findShowcaseArtsByTag(
	tagId: Tables["ArtTag"]["id"],
): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom("TaggedArt")
		.innerJoin("Art", "Art.id", "TaggedArt.artId")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select([
			"Art.id",
			"Art.createdAt",
			"User.id as userId",
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			"UserSubmittedImage.url",
		])
		.where("TaggedArt.tagId", "=", tagId)
		.orderBy("Art.isShowcase", "desc")
		.orderBy("Art.createdAt", "desc")
		.execute();

	const encounteredUserIds = new Set<number>();

	return arts
		.filter((row) => {
			if (encounteredUserIds.has(row.userId)) {
				return false;
			}

			encounteredUserIds.add(row.userId);

			return true;
		})
		.map((a) => ({
			id: a.id,
			createdAt: a.createdAt,
			url: a.url,
			author: {
				commissionsOpen: a.commissionsOpen,
				discordAvatar: a.discordAvatar,
				discordId: a.discordId,
				username: a.username,
			},
		}));
}

export async function findRecentlyUploadedArts(): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom("Art")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select([
			"Art.id",
			"Art.createdAt",
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			"UserSubmittedImage.url",
		])
		.orderBy("Art.createdAt", "desc")
		.limit(100)
		.execute();

	return arts.map((a) => ({
		id: a.id,
		createdAt: a.createdAt,
		url: a.url,
		author: {
			commissionsOpen: a.commissionsOpen,
			discordAvatar: a.discordAvatar,
			discordId: a.discordId,
			username: a.username,
		},
	}));
}

export async function findAllTags() {
	return db.selectFrom("ArtTag").select(["id", "name"]).execute();
}
