import { useLoaderData } from "@remix-run/react";
import { Main } from "../../../components/Main";

import { loader } from "../loaders/scrims.server";
export { loader };

export default function ScrimsPage() {
	const data = useLoaderData<typeof loader>();

	// console.log(data);

	return <Main>Hellou {data.posts.length}</Main>;
}
