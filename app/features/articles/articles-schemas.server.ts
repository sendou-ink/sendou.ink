import { z } from "zod";

const authorName = z.string().min(1);

const author = z.union([
	authorName,
	z.object({ name: authorName, link: z.string().url() }),
]);

export const articleDataSchema = z.object({
	title: z.string().min(1),
	author: z.union([author, z.array(author)]),
	date: z.date(),
});
