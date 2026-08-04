import type { LoaderFunctionArgs } from "react-router";
import invariant from "~/utils/invariant";
import { notFoundIfNullish } from "~/utils/remix.server";
import { articleBySlug } from "../core/bySlug.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const article = notFoundIfNullish(articleBySlug(params.slug));

	return { ...article, slug: params.slug };
};
