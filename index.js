import mysql from 'mysql2/promise';
import {faker} from '@faker-js/faker';
import pg from 'pg';
import inquirer from 'inquirer';
import chalk from 'chalk';

// TODO: add typescript
// TODO: Duplicate entry bug. Check articletags table.
// TODO (feature): validate column.

const IS_DEBUG_MODE = true;

const isPostgreSQLDb = () => dbType === 'pg';

class Log {
    static info(...msgs) {
        console.log(chalk.blue(...msgs));
    }

    static success(...msgs) {
        console.log(chalk.green(...msgs));
    }

    static error(...msgs) {
        console.log(chalk.red(...msgs));
    }

}

const connectToDb = async (dbType, credentials) => {

    Log.info('Connecting to database...');
    let connection;

    if (isPostgreSQLDb()) {
        connection = new pg.Client(credentials)
        await connection.connect()
    } else {
        connection = await mysql.createConnection(credentials);
        if (IS_DEBUG_MODE) attachDbLogger(connection);
    }

    const originalQuery = connection.query;
    connection.query = async (...args) => {
        const queryResult = await originalQuery.call(connection, ...args);
        return isPostgreSQLDb() ? queryResult.rows : queryResult[0];
    }

    Log.success('Database connection established!');

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

const getUserDatabaseNames = async (connection) => {
    const results = await connection.query("SELECT `schema_name` from INFORMATION_SCHEMA.SCHEMATA  WHERE `schema_name` NOT IN('information_schema', 'mysql', 'performance_schema', 'sys');");
    const databaseNames = [];
    for (const row of results) {
        databaseNames.push(getValFromObject(row));
    }

    return databaseNames;
}

const getTableNames = async (connection) => {
    const results = await connection.query('SHOW TABLES');
    const tableNames = [];
    for (const row of results) {
        tableNames.push(getValFromObject(row));
    }

    return tableNames;
}

const getTableColumns = async (connection, tableName, options = {}) => {
    const results = await connection.query(`select * from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME='${tableName}' AND TABLE_SCHEMA='${databaseName}'`);
    const columns = [];
    for (const row of results) {


        const columnName = isPostgreSQLDb() ? row.column_name : row.COLUMN_NAME;
        const dataType = isPostgreSQLDb() ? row.udt_name : row.DATA_TYPE;
        const isNullable = isPostgreSQLDb() ? row.is_nullable : row.IS_NULLABLE;
        const maxLength = isPostgreSQLDb() ? row.character_maximum_length : row.CHARACTER_MAXIMUM_LENGTH;
        const columnDefault = isPostgreSQLDb() ? row.column_default : row.EXTRA;
        const columnType = isPostgreSQLDb() ? row.data_type : row.COLUMN_TYPE;
        const isUnique = isPostgreSQLDb() ? row.is_unique : row.COLUMN_KEY === 'UNI';

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

    /*TODO: remove IGNORE and instead find a way to use unique value always.*/
    const insertQuery = `INSERT IGNORE INTO ${tableName} (${columnNames.join(', ')}) VALUES ${valuesPlaceholders}`;

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

const getTablesWithNoReferences = async (connection) => {
    let query = '';
    if (isPostgreSQLDb()) {
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

const fetchAllTablesRefs = async (connection) => {

    let query;

    if (isPostgreSQLDb()) {
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
        const TABLE_NAME_KEY = isPostgreSQLDb() ? 'child_table' : 'TABLE_NAME';
        const COLUMN_NAME_KEY = isPostgreSQLDb() ? 'child_column' : 'COLUMN_NAME';
        const REFERENCED_TABLE_NAME_KEY = isPostgreSQLDb() ? 'parent_table' : 'REFERENCED_TABLE_NAME';
        const REFERENCED_COLUMN_NAME_KEY = isPostgreSQLDb() ? 'parent_column' : 'REFERENCED_COLUMN_NAME';

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
            const results = await connection.query(`select ${ref.refColumn} from ${ref.refTable} limit ${rowsToInsert}`);
            relationalData[ref.column] = results.map(row => getValFromObject(row));
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
}

const promptInitialQuestions = async () => {
    const questions = [
        {
            type: 'list',
            name: 'databaseType',
            message: 'What database do you want to use?',
            choices: ['MySQL', 'PostgreSQL'],
            filter(val) {
                return val.toLowerCase();
            },
        },
        {
            type: 'input',
            name: 'rowsToInsert',
            message: 'How many rows do you want to insert per table?',
            validate(value) {
                const valid = value >= 1;
                return valid || 'Please enter a valid number (>= 1)';
            },
            filter(val) {
                if (isNaN(Number(val))) {
                    return val;
                }
                return Number(val);
            }
        },
        {
            type: 'input',
            name: 'host',
            message: 'Enter the database host:',
            default: 'localhost'
        },
        {
            type: 'input',
            name: 'user',
            message: 'Enter the database user:',
            default: 'root'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter the database password:',
            mask: '*'
        },
    ]

    return inquirer.prompt(questions);
}


const useDatabase = async (connection, databaseName) => {
    await connection.query(`USE ${databaseName}`);
}

const selectDatabase = async (connection) => {
    const databaseName = await promptSelectDatabase(connection);
    global.databaseName = databaseName;
    await useDatabase(connection, databaseName);
}

/*faker.word.sample({
    length: {max: 255},
    strategy: 'any-length'
})*/
/*faker.lorem.paragraphs*/
// also define number of rows to insert in all tables.

const promptSelectDatabase = async (connection) => {
    const databaseNames = await getUserDatabaseNames(connection);
    const questions = [
        {
            type: 'list',
            name: 'databaseName',
            message: 'Select a database to fill:',
            choices: databaseNames,
        }
    ]

    const answers = await inquirer.prompt(questions);
    return answers.databaseName;
}

const getDatabaseCredentials = async () => {

    const credentials = {};

    if (isDebugMode) {
        global.dbType = 'mysql';
        global.databaseName = 'db_auto_filler';
        global.dbType = 'mysql';
        global.rowsToInsert = Number(process.argv[2]) || 1;
        credentials.host = 'localhost';
        credentials.user = 'root';
        credentials.password = 'toor';
        credentials.database = 'db_auto_filler';
    } else {
        const {databaseType, rowsToInsert, host, user, password} = await promptInitialQuestions();
        global.dbType = databaseType;
        global.rowsToInsert = rowsToInsert;
        credentials.host = host;
        credentials.user = user;
        credentials.password = password;
    }

    return credentials;
}

global.isDebugMode = false;

(async () => {
    /*
    * Setup global variables for debugging.
    * TODO: remove after testing.
    * */

    const credentials = await getDatabaseCredentials();

    const connection = await connectToDb(dbType, credentials);

    if (!isDebugMode) {
        await selectDatabase(connection);
    }

    Log.info('You have selected:');
    Log.info(`Database Type: ${dbType}`);
    Log.info(`Database name: ${databaseName}`);
    Log.info(`Rows to insert: ${rowsToInsert}`);

    const populatedTables = await populateAllTables(connection);
    const totalTableNames = await getTableNames(connection);

    closeDbConnection(connection);

    Log.info('Populated tables:', populatedTables);
    Log.info(`Populated ${populatedTables.length} out of ${totalTableNames.length} tables`);
    Log.success('Database filled successfully! ✅️');
})().catch((err) => {
    Log.error(err);
});