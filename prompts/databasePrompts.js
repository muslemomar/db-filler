import inquirer from 'inquirer';
import { initialQuestions, selectDatabaseQuestion } from './questions.js';
import {getUserDatabaseNames} from "../database/queries.js";

export const promptInitialQuestions = async () => {
    return inquirer.prompt(initialQuestions);
};

export const promptSelectDatabase = async (connection) => {
    const databaseNames = await getUserDatabaseNames(connection);
    selectDatabaseQuestion.choices = databaseNames;
    const answers = await inquirer.prompt([selectDatabaseQuestion]);
    return answers.databaseName;
};
