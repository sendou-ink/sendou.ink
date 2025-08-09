import * as actions from './actions.remote';
import * as queries from './queries.remote';
import * as schemas from './schemas';

export const BuildAPI = {
	...actions,
	...queries,
	schemas
};
