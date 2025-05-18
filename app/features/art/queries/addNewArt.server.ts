import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import invariant from "~/utils/invariant";

const addImgStm = sql.prepare(/* sql */ `
  insert into "UnvalidatedUserSubmittedImage"
    ("submitterUserId", "url", "validatedAt")
  values
    (@authorId, @url, @validatedAt)
  returning *
`);

const addArtStm = sql.prepare(/* sql */ `
  insert into "Art"
    (
      "authorId",
      "description",
      "imgId",
      "isShowcase"
    )
  values
    (
      @authorId,
      @description,
      @imgId,
      -- ensures first art is always showcase
      not exists (
        select
          1
        from
          "Art"
        where
          "authorId" = @authorId
      )
    )
  returning *
`);

const addArtTagStm = sql.prepare(/* sql */ `
  insert into "ArtTag"
    ("name", "authorId")
  values
    (@name, @authorId)
  returning *
`);

const addTaggedArtStm = sql.prepare(/* sql */ `
  insert into "TaggedArt"
    ("artId", "tagId")
  values
    (@artId, @tagId)
`);

const deleteAllTaggedArtStm = sql.prepare(/* sql */ `
  delete from
    "TaggedArt"
  where
    "artId" = @artId
`);

const updateArtStm = sql.prepare(/* sql */ `
  update
    "Art"
  set
    "description" = @description,
    "isShowcase" = @isShowcase
  where
    "id" = @artId
  returning *
`);

const removeIsShowcaseFromAllStm = sql.prepare(/* sql */ `
  update
    "Art"
  set
    "isShowcase" = 0
  where
    "authorId" = @authorId
`);

const addArtUserMetadataStm = sql.prepare(/* sql */ `
  insert into "ArtUserMetadata"
    ("artId", "userId")
  values
    (@artId, @userId)
`);

const removeUserMetadataStm = sql.prepare(/* sql */ `
  delete from
    "ArtUserMetadata"
  where
    "artId" = @artId
`);

type TagsToAdd = Array<Partial<Pick<Tables["ArtTag"], "name" | "id">>>;
type AddNewArtArgs = Pick<Tables["Art"], "authorId" | "description"> &
	Pick<Tables["UserSubmittedImage"], "url" | "validatedAt"> & {
		linkedUsers: number[];
		tags: TagsToAdd;
	};

export const addNewArt = sql.transaction((args: AddNewArtArgs) => {
	const img = addImgStm.get({
		authorId: args.authorId,
		url: args.url,
		validatedAt: args.validatedAt,
	}) as Tables["UserSubmittedImage"];
	const art = addArtStm.get({
		authorId: args.authorId,
		description: args.description,
		imgId: img.id,
	}) as Tables["Art"];

	for (const userId of args.linkedUsers) {
		addArtUserMetadataStm.run({ artId: art.id, userId });
	}

	for (const tag of args.tags) {
		let tagId = tag.id;
		if (!tagId) {
			invariant(tag.name, "tag name must be provided if no id");

			const newTag = addArtTagStm.get({
				name: tag.name,
				authorId: args.authorId,
			}) as Tables["ArtTag"];
			tagId = newTag.id;
		}

		addTaggedArtStm.run({ artId: art.id, tagId });
	}

	return art.id;
});

type EditArtArgs = Pick<
	Tables["Art"],
	"authorId" | "description" | "isShowcase"
> & {
	linkedUsers: number[];
	artId: number;
	tags: TagsToAdd;
};

export const editArt = sql.transaction((args: EditArtArgs) => {
	if (args.isShowcase) {
		removeIsShowcaseFromAllStm.run({
			authorId: args.authorId,
		});
	}

	const updatedArt = updateArtStm.get({
		description: args.description,
		isShowcase: args.isShowcase,
		artId: args.artId,
	});

	removeUserMetadataStm.run({ artId: args.artId });
	for (const userId of args.linkedUsers) {
		addArtUserMetadataStm.run({ artId: args.artId, userId });
	}

	deleteAllTaggedArtStm.run({ artId: args.artId });
	for (const tag of args.tags) {
		let tagId = tag.id;
		if (!tagId) {
			invariant(tag.name, "tag name must be provided if no id");

			const newTag = addArtTagStm.get({
				name: tag.name,
				authorId: args.authorId,
			}) as Tables["ArtTag"];
			tagId = newTag.id;
		}

		addTaggedArtStm.run({ artId: args.artId, tagId });
	}

	return (updatedArt as { id: number }).id;
});
