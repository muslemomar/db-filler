import Log from './logger/index.js';
import {promptInitialQuestions, promptSelectDatabase} from "./prompts/databasePrompts.js";
import {closeDbConnection, connectToDb, useDatabase} from "./database/connect.js";
import {getTableNames} from "./database/queries.js";
import {populateAllTables} from "./database/populate.js";
import {isDebugMode} from "./config/config.js";


// TODO: add typescript
// TODO: Duplicate entry bug. Check articletags table.
// TODO (feature): validate column.

const selectAndUseDatabase = async (connection) => {
    const databaseName = await promptSelectDatabase(connection);
    global.databaseName = databaseName;
    await useDatabase(connection, databaseName);
}

const getDatabaseCredentials = async () => {

    const credentials = {};

    if (isDebugMode) {
        global.dbType = 'mysql';
        global.databaseName = 'db_auto_filler';
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

    global.isPostgreSQLDb = dbType === 'pg';

    return credentials;
}

const run = async () => {
    const credentials = await getDatabaseCredentials();

    const connection = await connectToDb(dbType, credentials);

    if (!isDebugMode) {
        await selectAndUseDatabase(connection);
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

}

run().then(r => r).catch(e => Log.error(e.stack));