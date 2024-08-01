import { faker } from '@faker-js/faker';

export const getFakerFnByColumnName = (columnName) => {
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

export const getFakerFnByColumnType = (columnType) => {
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

export const getFakerFnByValidValues = (validValues) => {
    return faker.helpers.arrayElement.bind(null, validValues);
};
