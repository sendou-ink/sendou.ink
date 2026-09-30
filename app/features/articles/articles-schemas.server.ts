import * as v from "valibot";

const authorName = v.pipe(v.string(), v.minLength(1));

const author = v.union([
	authorName,
	v.object({ name: authorName, link: v.pipe(v.string(), v.url()) }),
]);

export const articleDataSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1)),
	author: v.union([author, v.array(author)]),
	date: v.date(),
});
