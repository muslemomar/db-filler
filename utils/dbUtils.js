export const getValFromObject = (obj) => {
    return Object.values(obj)[0];
}

export const arrayFromRawEnumVals = (rawEnumValues) => {
    return rawEnumValues.match(/enum\((.*)\)/)[1].split(',').map(value => value.replaceAll('\'', ''));
}