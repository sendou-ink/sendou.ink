import invariant from "@sendou/utils/invariant";
import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish } from "~/utils/remix.server";
import { articleBySlug } from "../core/bySlug.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const article = notFoundIfNullish(articleBySlug(params.slug));

	return { ...article, slug: params.slug };
};
