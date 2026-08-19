import { type LoaderFunctionArgs, redirect } from "react-router";
import { resolveRedirect } from "~/modules/redirects";

/** Catches every URL matching no other route, so that pages that moved away can still redirect. */
export const loader = ({ request }: LoaderFunctionArgs) => {
	const redirectTo = resolveRedirect(new URL(request.url));
	if (redirectTo) return redirect(redirectTo);

	throw new Response(null, { status: 404 });
};
