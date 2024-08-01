import chalk from 'chalk';

import Log from './logger/index.js';
import {promptInitialQuestions, promptSelectDatabase} from "./prompts/databasePrompts.js";
import {closeDbConnection, connectToDb, useDatabase} from "./database/connect.js";
import {getTableNames} from "./database/queries.js";
import {populateAllTables} from "./database/populate.js";
import {isDebugMode} from "./config/config.js";
import {logInsertWarningMessage, logResults, logUserInput} from "./logger/logMessages.js";


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

    logUserInput();
    logInsertWarningMessage();

    await logResults(connection);

    closeDbConnection(connection);
}

run().catch(e => Log.error(e.stack));