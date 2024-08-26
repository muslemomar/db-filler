#!/usr/bin/env node

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
        /*
        * You can put your database credentials here if you want to run the script in debug mode.
        * */
        global.dbType = 'mysql';
        global.databaseName = 'db_filler';
        global.rowsToInsert = Number(process.argv[2]) || 1;
        credentials.host = 'localhost';
        credentials.user = 'root';
        credentials.password = 'toor';
        credentials.database = 'db_filler';
    } else {
        const {databaseType, rowsToInsert, host, user, password} = await promptInitialQuestions();
        global.dbType = databaseType;
        global.rowsToInsert = rowsToInsert;
        credentials.host = host;
        credentials.user = user;
        credentials.password = password;
    }

    global.isPostgreSQLDb = dbType === 'postgresql';

    return credentials;
}

const run = async () => {
    const credentials = await getDatabaseCredentials();

    const connection = await connectToDb(dbType, credentials);

    if (!isDebugMode) {
        await selectAndUseDatabase(connection);
    }

    logUserInput(global.dbType, global.databaseName, global.rowsToInsert);
    logInsertWarningMessage();

    const populatedTables = await populateAllTables(connection);
    const totalTableNames = await getTableNames(connection);

    await logResults(populatedTables, totalTableNames);

    closeDbConnection(connection);
}

run().catch(e => Log.error(e.stack));