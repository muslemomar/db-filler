import {arrayFromRawEnumVals, getValFromObject} from "../utils/dbUtils.js";
import {getFakerFnByColumn} from "../faker/index.js";

export const getUserDatabaseNames = async (connection) => {
    const results = await connection.query("SELECT `schema_name` from INFORMATION_SCHEMA.SCHEMATA  WHERE `schema_name` NOT IN('information_schema', 'mysql', 'performance_schema', 'sys');");
    const databaseNames = [];
    for (const row of results) {
        databaseNames.push(getValFromObject(row));
    }

    return databaseNames;
}

export const getTableNames = async (connection) => {
    const results = await connection.query('SHOW TABLES');
    const tableNames = [];
    for (const row of results) {
        tableNames.push(getValFromObject(row));
    }

    return tableNames;
}

export const constructInsertQuery = (tableName, columnNames) => {
    const columnsAsPlaceholders = columnNames.map(_ => '?').join(', ')
    const valuesPlaceholders = `${[...new Array(rowsToInsert)].map(_ => `(${columnsAsPlaceholders})`).join(', ')}`;

    /*TODO: remove IGNORE and instead find a way to use unique value always.*/
    const insertQuery = `INSERT IGNORE INTO ${tableName} (${columnNames.join(', ')}) VALUES ${valuesPlaceholders}`;

    return insertQuery;
}

export const getTableColumns = async (connection, tableName, options = {}) => {
    const results = await connection.query(`select * from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME='${tableName}' AND TABLE_SCHEMA='${databaseName}'`);
    const columns = [];
    for (const row of results) {


        const columnName = isPostgreSQLDb ? row.column_name : row.COLUMN_NAME;
        const dataType = isPostgreSQLDb ? row.udt_name : row.DATA_TYPE;
        const isNullable = isPostgreSQLDb ? row.is_nullable : row.IS_NULLABLE;
        const maxLength = isPostgreSQLDb ? row.character_maximum_length : row.CHARACTER_MAXIMUM_LENGTH;
        const columnDefault = isPostgreSQLDb ? row.column_default : row.EXTRA;
        const columnType = isPostgreSQLDb ? row.data_type : row.COLUMN_TYPE;
        const isUnique = isPostgreSQLDb ? row.is_unique : row.COLUMN_KEY === 'UNI';

        const validColumnValues = [];
        if (columnType.includes('enum')) {
            validColumnValues.push(...arrayFromRawEnumVals(columnType));
        }

        const isColumnAutoIncrement = !!columnDefault;

        if (options.noAutoIncrement && isColumnAutoIncrement) continue;

        columns.push({
            name: columnName,
            type: dataType,
            isNullable: isNullable === 'YES',
            maxLength: maxLength,
            isAutoIncrement: !!columnDefault,
            validColumnValues,
            isUnique
        });
    }
    return columns;
}

export const insertFakeDataIntoTable = async (connection, tableName, columns, relationalData = {}) => {
    const insertQuery = constructInsertQuery(
        tableName,
        columns.map(c => c.name),
        rowsToInsert
    );

    const insertValues = [];
    for (let i = 0; i < rowsToInsert; i++) {
        for (const column of columns) {
            if (relationalData[column.name]) {
                insertValues.push(relationalData[column.name][i]);
                continue;
            }

            const fakerMatchingFn = getFakerFnByColumn(column.name, column.type, column.validColumnValues);
            insertValues.push(fakerMatchingFn()); // put a random value.
        }
    }

    // TODO: possible bug
    // if any of the "insertvalues" is undefined, change to null. TypeError: Bind parameters must not contain undefined. To pass SQL NULL specify JS null
    /*
    console.log('error of insertvalues undefined', err);
        const index = insertValues.findIndex(x => x == null);
        console.log('index', index);
        console.log(insertQuery.slice(0, 50));
        console.log(insertValues.slice(index - 5, index + 5));*/

    return await connection.execute(insertQuery, insertValues);
}

export const getTablesWithNoReferences = async (connection) => {
    let query;

    if (isPostgreSQLDb) {
        query = `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND TABLE_NAME NOT IN
        (SELECT DISTINCT TABLE_NAME
         FROM information_schema.key_column_usage
         WHERE table_schema = 'public'
       AND CONSTRAINT_NAME IN
         (SELECT CONSTRAINT_NAME
          FROM information_schema.table_constraints
          WHERE constraint_type = 'FOREIGN KEY'
            AND table_schema = 'public'
 ) );
        `
    } else {
        query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${databaseName}'
        AND table_name NOT IN (
            SELECT table_name
            FROM information_schema.key_column_usage
            WHERE table_schema = '${databaseName}'
            AND referenced_table_name IS NOT NULL
        )
    `;
    }

    const results = await connection.query(query);

    const tableNames = [];
    for (const row of results) {
        tableNames.push(getValFromObject(row));
    }

    return tableNames;
}

export const fetchAllTablesRefs = async (connection) => {

    let query;

    if (isPostgreSQLDb) {
        query = `SELECT tc.table_name AS child_table,
                   kcu.column_name AS child_column,
                   ccu.table_name AS parent_table,
                   ccu.column_name AS parent_column,
                   tc.constraint_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            ORDER  BY child_table,parent_table;`
    } else {
        query = `
        SELECT table_name, column_name, referenced_table_name, referenced_column_name
        FROM information_schema.key_column_usage
        WHERE table_schema = '${databaseName}'
        AND referenced_table_name IS NOT NULL`;
    }

    const results = await connection.query(query);

    const tables = {};
    for (const row of results) {
        const TABLE_NAME_KEY = isPostgreSQLDb ? 'child_table' : 'TABLE_NAME';
        const COLUMN_NAME_KEY = isPostgreSQLDb ? 'child_column' : 'COLUMN_NAME';
        const REFERENCED_TABLE_NAME_KEY = isPostgreSQLDb ? 'parent_table' : 'REFERENCED_TABLE_NAME';
        const REFERENCED_COLUMN_NAME_KEY = isPostgreSQLDb ? 'parent_column' : 'REFERENCED_COLUMN_NAME';

        if (!tables[row[TABLE_NAME_KEY]]) {
            tables[row[TABLE_NAME_KEY]] = [];
        }
        tables[row[TABLE_NAME_KEY]].push({
            column: row[COLUMN_NAME_KEY],
            refTable: row[REFERENCED_TABLE_NAME_KEY],
            refColumn: row[REFERENCED_COLUMN_NAME_KEY]
        });
    }

    return tables;
}
