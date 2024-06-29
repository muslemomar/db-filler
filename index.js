const mysql = require('mysql2/promise');
const {faker} = require('@faker-js/faker');
const {argv} = require('node:process');
const pg = require('pg');

// TODO: Duplicate entry bug. Check articletags table.
// TODO (feature): validate column.
// TODO: when database type is selected and connected, list all databases and ask user to select one.

const dbType = argv[3];

const connectToDb = async () => {

    let connection;

    if (dbType === 'pg') {
        const {Client} = pg
        connection = new Client()
        await connection.connect()
    } else {
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            database: 'db_auto_filler',
            password: '', // test ide
        });

        const isDebug = false;
        if (isDebug) attachDbLogger(connection);
    }

    console.log('Database connection established!');

    return connection;
}

const attachDbLogger = (connection) => {
    ['query', 'execute'].forEach((command) => {
        const originalFn = connection[command];

        connection[command] = function (sql, values) {
            console.log('Query:', sql);
            console.log('Values:', values);
            console.log('------------------------------------------');
            return originalFn.call(this, sql, values).then(([rows, fields]) => {
                return [rows, fields];
            });
        };
    });
}

const getValFromObject = (obj) => {
    return Object.values(obj)[0];
}

const arrayFromRawEnumVals = (rawEnumValues) => {
    return rawEnumValues.match(/enum\((.*)\)/)[1].split(',').map(value => value.replaceAll('\'', ''));
}

const getTableNames = async (connection) => {
    const [results] = await connection.query('SHOW TABLES');
    const tableNames = [];
    for (const row of results) {
        tableNames.push(getValFromObject(row));
    }

    return tableNames;
}

const DATABASE_NAME = 'db_auto_filler';

const getTableColumns = async (connection, tableName, options = {}) => {
    const [results] = await connection.query(`select * from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME='${tableName}'`);

    const columns = [];
    for (const row of results) {
        const {COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, EXTRA, TABLE_SCHEMA, COLUMN_TYPE} = row;

        const validColumnValues = [];
        if (COLUMN_TYPE.includes('enum')) {
            validColumnValues.push(...arrayFromRawEnumVals(COLUMN_TYPE));
        }

        const isColumnAutoIncrement = EXTRA === 'auto_increment';

        if (TABLE_SCHEMA !== DATABASE_NAME) continue;
        if (options.noAutoIncrement && isColumnAutoIncrement) continue;

        columns.push({
            name: COLUMN_NAME,
            type: DATA_TYPE,
            isNullable: IS_NULLABLE === 'YES',
            maxLength: CHARACTER_MAXIMUM_LENGTH,
            isAutoIncrement: EXTRA === 'auto_increment',
            validColumnValues
        });
    }
    return columns;
}

const getFakerFnByColumnName = (columnName) => {
    columnName = columnName.toLowerCase().replaceAll('_', '');

    if (columnName === 'id') return faker.number.int.bind(null, {max: 2147483647});
    if (columnName === 'name') return faker.person.fullName;
    if (columnName === 'fullname') return faker.person.fullName;
    if (columnName === 'firstname') return faker.person.firstName;
    if (columnName === 'lastname') return faker.person.lastName;
    if (columnName === 'username') return faker.internet.userName;
    if (columnName === 'email') return faker.internet.email;
    if (columnName.includes('password')) return faker.internet.password;
    if (columnName === 'createdat' || columnName === 'updatedat') return faker.date.recent;
    if (columnName.includes('date')) return faker.date.past;
    return null;
}

const getFakerFnByColumnType = (columnType) => {
    const MAX_SQL_INT_VALUE = 2147483647;
    const COLUMN_TYPE_FAKER_MAP = {
        'int': faker.number.int.bind(null, {max: MAX_SQL_INT_VALUE}),
        'varchar': faker.word.sample,
        'text': faker.lorem.paragraphs,
        'date': faker.date.past,
        'datetime': faker.date.past,
        'timestamp': faker.date.past,
        'tinyint': faker.number.int.bind(null, {max: 1}),
        'smallint': faker.number.int.bind(null, {max: 32767}),
        'mediumint': faker.number.int.bind(null, {max: 8388607}),
        'bigint': faker.number.int.bind(null, {max: 9223372036854775807}),
        'decimal': faker.number.float,
        'float': faker.number.float,
        'double': faker.number.float,
        'real': faker.number.float,
        'enum': faker.word.sample,
    };

    return COLUMN_TYPE_FAKER_MAP[columnType];
}

const getFakerFnByValidValues = (validValues) => {
    return faker.helpers.arrayElement.bind(null, validValues);
}

const getFakerFnByColumn = (columnName, columnType, validValues) => {
    if (validValues.length) return getFakerFnByValidValues(validValues);
    const matchingFakerFn = getFakerFnByColumnName(columnName) || getFakerFnByColumnType(columnType) || faker.word.sample;
    return matchingFakerFn;
}

const constructInsertQuery = (tableName, columnNames) => {

    const columnsAsPlaceholders = columnNames.map(_ => '?').join(', ')
    const valuesPlaceholders = `${[...new Array(rowsToInsert)].map(_ => `(${columnsAsPlaceholders})`).join(', ')}`;

    const insertQuery = `
            INSERT INTO ${tableName} (${columnNames.join(', ')})
            VALUES ${valuesPlaceholders}`;

    return insertQuery;
}

const insertFakeDataIntoTable = async (connection, tableName, columns, relationalData = {}) => {
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
            insertValues.push(fakerMatchingFn());
        }
    }

    const [results] = await connection.execute(insertQuery, insertValues);
    return results;
}

const getTablesWithNoReferences = async (connection) => {
    const [results] = await connection.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${DATABASE_NAME}'
        AND table_name NOT IN (
            SELECT table_name
            FROM information_schema.key_column_usage
            WHERE table_schema = '${DATABASE_NAME}'
            AND referenced_table_name IS NOT NULL
        )
    `);

    const tableNames = []; // test ide
    for (const row of results) {
        tableNames.push(getValFromObject(row));
    }

    return tableNames;
}

const fetchAllTablesRefs = async (connection) => {

    let query;
    let results;

    if (dbType === 'pg') {
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
        WHERE table_schema = '${DATABASE_NAME}'
        AND referenced_table_name IS NOT NULL`;
    }

    // TODO: later make a function to encapsulate the query and results, so we don't care about handling the results, we just query and it returns the results no matter the db type.

    // const [results] = await connection.query(query);
    const queryResult = await connection.query(query);
    if (dbType === 'pg') {
        results = queryResult.fields;
    } else {

    }
    console.log(x);
    return;
    const tables = {};
    for (const row of results) {
        if (!tables[row.TABLE_NAME]) {
            tables[row.TABLE_NAME] = [];
        }
        tables[row.TABLE_NAME].push({
            column: row.COLUMN_NAME,
            refTable: row.REFERENCED_TABLE_NAME,
            refColumn: row.REFERENCED_COLUMN_NAME
        });
    }

    return tables;
}

const populateTablesWithoutRefs = async (connection, tables) => {
    const populatedTables = [];
    for (const table of tables) {
        const columns = await getTableColumns(connection, table, {noAutoIncrement: true});
        await insertFakeDataIntoTable(connection, table, columns);
        populatedTables.push(table);
    }
    return populatedTables;
};

const hasAllRefsPopulated = (table, tablesWithRefs, allPopulatedTables) => {
    return tablesWithRefs[table]
        .every(ref => allPopulatedTables.includes(ref.refTable))
}

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
            const [results] = await connection.query(`select ${ref.refColumn} from ${ref.refTable} limit ${rowsToInsert}`);

            /*if (table === 'articletags') {
                console.log(`select ${ref.refColumn} from ${ref.refTable} ORDER BY RAND() limit ${LIMIT}`);
            }*/
            console.log('-----------------------');
            console.log(ref);
            console.log(results);
            relationalData[ref.column] = results.map(row => getValFromObject(row)); // I'm only passing one value, pass all of them.
            console.log(relationalData);
        }

        const columns = await getTableColumns(connection, table, {noAutoIncrement: true});
        await insertFakeDataIntoTable(connection, table, columns, relationalData);

        if (!populatedTables.includes(table)) populatedTables.push(table);
    }

    return populatedTables;
}

const populateAllTables = async (connection) => {
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

const closeDbConnection = (connection) => {
    connection.end();
    console.log('Database connection closed!');
}

/*faker.word.sample({
    length: {max: 255},
    strategy: 'any-length'
})*/
/*faker.lorem.paragraphs*/
// also define number of rows to insert in all tables.

(async () => {

    const connection = await connectToDb();
    global.rowsToInsert = Number(argv[2]);

    const populatedTables = await populateAllTables(connection);
    const totalTableNames = await getTableNames(connection);

    closeDbConnection(connection);

    console.log('Populated tables:', populatedTables);
    console.log(`Populated ${populatedTables.length} out of ${totalTableNames.length} tables`);
    console.log('Database filled successfully! ✅️');
})();