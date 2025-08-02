import { db } from '../sql';

export function deleteById(id: number) {
	return db.deleteFrom('UnvalidatedVideo').where('id', '=', id).execute();
}
