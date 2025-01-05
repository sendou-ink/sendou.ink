// import { useLoaderData } from "@remix-run/react";
import { loader } from "../loader/to.$id.divisions.server";
export { loader };

export default function TournamentDivisionsPage() {
	// const data = useLoaderData<typeof loader>();

	return (
		<div className="text-center text-lg font-semi-bold text-lighter">
			Divisions have not been released yet, check back later
		</div>
	);
}
