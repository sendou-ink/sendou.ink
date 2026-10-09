import { type LoaderFunctionArgs, redirect } from "react-router";
import * as Redirect from "~/modules/redirects/core/Redirect";
import { notFound } from "~/utils/remix.server";

/** Catches every URL matching no other route, so that pages that moved away can still redirect. */
export const loader = ({ request }: LoaderFunctionArgs) => {
	const redirectTo = Redirect.resolve(new URL(request.url));
	if (redirectTo) return redirect(redirectTo);

	notFound();
};

/** Never renders (the loader always redirects or throws), but as a page route the 404 shows the error page. */
export default function CatchAllPage() {
	return null;
}
