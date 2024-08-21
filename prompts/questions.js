export const initialQuestions = [
    {
        type: 'list',
        name: 'databaseType',
        message: 'What database do you want to use?',
        choices: [
            {
                name: 'MySQL',
                value: 'mysql',
            },
            {
                name: 'PostgreSQL',
                value: 'postgresql',
                disabled: 'coming soon!'

            }
        ],
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
];

export const selectDatabaseQuestion = {
    type: 'list',
    name: 'databaseName',
    message: 'Select a database to fill:',
    choices: [],
};
