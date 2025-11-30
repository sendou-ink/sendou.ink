import { createCookie } from "@remix-run/node";
import invariant from "~/utils/invariant";

if (process.env.NODE_ENV === "production") {
	invariant(process.env.SESSION_SECRET, "SESSION_SECRET is required");
}

/** Discord linked role security state cookie to validate identity during the redirect */
export const clientStateCookie = createCookie("clientState", {
	maxAge: 60 * 5,
	path: "/",
	httpOnly: process.env.NODE_ENV === "production",
	sameSite: "lax",
	secrets: [process.env.SESSION_SECRET ?? "secret"],
	secure: process.env.NODE_ENV === "production",
});
