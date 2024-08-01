import Log from "./index.js";
import chalk from "chalk";

export const logUserInput = (dbType, databaseName, rowsToInsert) => {
    Log.info('\r');
    Log.info('You have selected:');
    Log.info(`🔵 ${chalk.bold('Database Type:')} ${chalk.cyan.bold(dbType)}`);
    Log.info(`🔵 ${chalk.bold('Database Name:')} ${chalk.cyan.bold(databaseName)}`);
    Log.info(`🔵 ${chalk.bold('Rows to Insert:')} ${chalk.cyan.bold(rowsToInsert)}`);
}

export const logInsertWarningMessage = () => {
    Log.info('\r');
    Log.warn('⚠️ Warning: The exact number of records inserted cannot be guaranteed. The process may not insert the exact number of rows specified due to constraints, database limits, or other factors.');
    Log.info('\r');
}

export const logResults = async (populatedTables, totalTableNames) => {
    Log.info(chalk.bold('Populated Tables:'), `${chalk.green(populatedTables.join(', '))}`);
    Log.info(chalk.bold('Tables:'), `${chalk.green(populatedTables.length + ' populated,')}`, chalk.white(totalTableNames.length + ' total'))
    Log.info('\r');
    Log.success(chalk.greenBright.bold.underline('✅️ Database filled successfully!'));
}
