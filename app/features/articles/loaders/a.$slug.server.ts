import type { LoaderFunctionArgs } from "@remix-run/node";
import invariant from "~/utils/invariant";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { articleBySlug } from "../core/bySlug.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const article = notFoundIfFalsy(articleBySlug(params.slug));

	return { ...article, slug: params.slug };
};
