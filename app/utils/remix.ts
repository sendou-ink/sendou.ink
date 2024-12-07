import type { ShouldRevalidateFunctionArgs } from "@remix-run/react";

export function isRevalidation(args: ShouldRevalidateFunctionArgs) {
	return (
		args.defaultShouldRevalidate && args.nextUrl.href === args.currentUrl.href
	);
}
