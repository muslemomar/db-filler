import Log from "../logger/index.js";
import pg from "pg";
import mysql from "mysql2/promise";
import {isDebugMode} from "../config/config.js";

export const connectToDb = async (dbType, credentials) => {

    Log.info('Connecting to database...');
    let connection;

    if (isPostgreSQLDb) {
        connection = new pg.Client(credentials)
        await connection.connect()
    } else {
        connection = await mysql.createConnection(credentials);
        if (isDebugMode) attachDbLogger(connection);
    }

    const originalQuery = connection.query;
    connection.query = async (...args) => {
        const queryResult = await originalQuery.call(connection, ...args);
        return isPostgreSQLDb ? queryResult.rows : queryResult[0];
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

export const closeDbConnection = (connection) => {
    connection.end();
}

export const useDatabase = async (connection, databaseName) => {
    await connection.query(`USE ${databaseName}`);
}