import {faker} from "@faker-js/faker";
import { getFakerFnByColumnName, getFakerFnByColumnType, getFakerFnByValidValues } from './helpers.js';

export const getFakerFnByColumn = (columnName, columnType, validValues) => {
    if (validValues.length) return getFakerFnByValidValues(validValues);
    const matchingFakerFn = getFakerFnByColumnName(columnName) || getFakerFnByColumnType(columnType) || faker.word.sample;
    return matchingFakerFn;
};