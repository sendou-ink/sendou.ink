import { useMatches } from "@remix-run/react";
import type { RootLoaderData } from "~/root";

export function useUser() {
	const [root] = useMatches();

	return (root.data as RootLoaderData | undefined)?.user;
}
