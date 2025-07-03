import { useLoaderData } from "@remix-run/react";
import { Main } from "~/components/Main";
import { loader } from "../loaders/t.$customUrl.results.server";
export { loader };

// xxx: custom colors?
export default function TeamResultsPage() {
	const data = useLoaderData<typeof loader>();

	return <Main>Results: {data.results.length}</Main>;
}
