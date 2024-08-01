import chalk from 'chalk';

export default class Log {
    static info(...msgs) {
        console.log(chalk.blue(...msgs));
    }

    static success(...msgs) {
        console.log(chalk.green(...msgs));
    }

    static error(...msgs) {
        console.log(chalk.red(...msgs));
    }

    static warn(...msgs) {
        console.log(chalk.bgYellow.yellowBright(...msgs));
    }

}

