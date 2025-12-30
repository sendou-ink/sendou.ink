import { useMatches } from "react-router";
import type { RootLoaderData } from "~/root";

export function useUser() {
	const [root] = useMatches();

	return (root.data as RootLoaderData | undefined)?.user;
}
