import {fetchAllTablesRefs, getTableColumns, getTablesWithNoReferences, insertFakeDataIntoTable} from "./queries.js";
import {getValFromObject} from "../utils/dbUtils.js";


const populateTablesWithoutRefs = async (connection, tables) => {
    const populatedTables = [];
    for (const table of tables) {
        const columns = await getTableColumns(connection, table, {noAutoIncrement: true});
        await insertFakeDataIntoTable(connection, table, columns);
        populatedTables.push(table);
    }
    return populatedTables;
};


const populateTablesWithRefs = async (connection, tables, tablesWithRefs, populatedNoRefTables) => {
    const populatedTables = [];

    let i = 0;
    while (populatedTables.length < tables.length) {
        const table = tables[i];
        i = i === tables.length - 1 ? 0 : i + 1;
        if (populatedTables.includes(table)) continue;


        const hasAllRefs = hasAllRefsPopulated(table, tablesWithRefs, populatedNoRefTables.concat(populatedTables));
        if (!hasAllRefs) continue;

        const relationalData = {};
        for (const ref of tablesWithRefs[table]) {
            const results = await connection.query(`select ${ref.refColumn} from ${ref.refTable} limit ${rowsToInsert}`);
            relationalData[ref.column] = results.map(row => getValFromObject(row));
        }

        const columns = await getTableColumns(connection, table, {noAutoIncrement: true});
        await insertFakeDataIntoTable(connection, table, columns, relationalData);

        if (!populatedTables.includes(table)) populatedTables.push(table);
    }

    return populatedTables;
}

export const populateAllTables = async (connection) => {
    const populatedTables = [];

    const tablesWithRefs = await fetchAllTablesRefs(connection);
    const tableNamesWithNoRefs = await getTablesWithNoReferences(connection);
    const tableNamesWithRefs = Object.keys(tablesWithRefs);

    const populatedNoRefTables = await populateTablesWithoutRefs(connection, tableNamesWithNoRefs);

    populatedTables.push(...populatedNoRefTables);

    populatedTables.push(
        ...await populateTablesWithRefs(connection, tableNamesWithRefs, tablesWithRefs, populatedNoRefTables)
    );

    return populatedTables;
}

const hasAllRefsPopulated = (table, tablesWithRefs, allPopulatedTables) => {
    return tablesWithRefs[table]
        .every(ref => allPopulatedTables.includes(ref.refTable))
}