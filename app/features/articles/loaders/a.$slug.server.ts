import type { LoaderFunctionArgs } from "react-router";
import { invariant } from "~/utils/invariant";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as Articles from "../core/Articles.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const article = notFoundIfNullish(Articles.findBySlug(params.slug));

	return { ...article, slug: params.slug };
};
