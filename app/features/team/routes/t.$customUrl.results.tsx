import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { TeamResultsTable } from "~/features/team/components/TeamResultsTable";
import { loader } from "../loaders/t.$customUrl.results.server";

export { loader };

export const handle = {
	i18n: ["user"],
};

export default function TeamResultsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<TeamGoBackButton />
			<TeamResultsTable results={data.results} />
		</Main>
	);
}
