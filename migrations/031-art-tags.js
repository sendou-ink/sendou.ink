export function up(db) {
	db.prepare(
		/*sql*/ `
    create table "ArtTag" (
      "id" integer primary key,
      "name" text unique not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "authorId" integer not null,
      foreign key ("authorId") references "User"("id") on delete restrict
    ) strict
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TaggedArt" (
      "artId" integer not null,
      "tagId" integer not null,
      foreign key ("artId") references "Art"("id") on delete cascade,
      foreign key ("tagId") references "ArtTag"("id") on delete cascade
    ) strict
  `,
	).run();

	db.prepare(`create index tagged_art_art_id on "TaggedArt"("artId")`).run();
	db.prepare(`create index tagged_art_tag_id on "TaggedArt"("tagId")`).run();
}
