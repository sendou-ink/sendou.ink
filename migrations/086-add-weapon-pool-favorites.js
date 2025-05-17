export function up(db) {
    db.transaction(() => {
        const users = db.prepare(
            /* sql */ 'SELECT id, qWeaponPool FROM User'
        ).all();

        const updateStatement = db.prepare(
            /* sql */ 'UPDATE User SET qWeaponPool = ? WHERE id = ?'
        );

        for (const user of users) {
            if (!user.qWeaponPool) continue;

            const pool = JSON.parse(user.qWeaponPool);
            const newPool = pool.map(id => ({
                weaponSplId: id,
                isFavorite: 0,
            }));

            updateStatement.run(JSON.stringify(newPool), user.id);
        }
    })();
}