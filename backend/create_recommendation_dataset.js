const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'dataset.csv');
const outputPath = path.join(__dirname, 'recommendation_dataset.csv');

function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const header = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        header.forEach((col, i) => { row[col] = values[i]; });
        return row;
    });
}

const LENGTH_TARGET = 12;
const CLASS_TARGET = 3;

function computeDeficits(f) {
    const dictionaryDeficit = f.dictionary_present ? 20 : 0;
    const patternDeficit = f.rule_pattern_present ? 15 : 0;
    const diversityDeficit = Math.max(0, CLASS_TARGET - f.character_class_count) * 10;
    const lengthDeficit = Math.max(0, LENGTH_TARGET - f.length) * 1;

    return { dictionaryDeficit, patternDeficit, diversityDeficit, lengthDeficit };
}

function pickLabel(deficits) {
    const { dictionaryDeficit, patternDeficit, diversityDeficit, lengthDeficit } = deficits;
    const ranked = [
        { label: "AVOID_DICTIONARY_WORDS", value: dictionaryDeficit },
        { label: "AVOID_PREDICTABLE_PATTERNS", value: patternDeficit },
        { label: "ADD_CHARACTER_VARIETY", value: diversityDeficit },
        { label: "INCREASE_LENGTH", value: lengthDeficit }
    ];

    ranked.sort((a, b) => b.value - a.value);

    if (ranked[0].value === 0) {
        return "INCREASE_LENGTH";
    }
    return ranked[0].label;
}

const inputText = fs.readFileSync(inputPath, 'utf-8');
const parsedRows = parseCsv(inputText);
const rows = [];

parsedRows.forEach((row) => {
    const features = {
        length: Number(row.f_length || 0),
        character_class_count: Number(row.f_char_class_count || 0),
        has_lowercase: Number(row.f_has_lowercase || 0),
        has_uppercase: Number(row.f_has_uppercase || 0),
        has_digit: Number(row.f_has_digit || 0),
        has_symbol: Number(row.f_has_symbol || 0),
        dictionary_present: Number(row.f_dictionary_present || 0),
        has_leetspeak: Number(row.f_has_leetspeak || 0),
        numeric_prefix: Number(row.f_numeric_prefix || 0),
        numeric_suffix: Number(row.f_numeric_suffix || 0),
        numeric_infix: Number(row.f_numeric_infix || 0),
        has_sequence: Number(row.f_has_sequence || 0),
        has_repetition: Number(row.f_has_repetition || 0),
        rule_pattern_present: Number(row.f_rule_pattern_present || 0)
    };

    const deficits = computeDeficits(features);
    const label = pickLabel(deficits);

    rows.push({
        password_sample: row.password_sample,
        ...features,
        recommendation_label: label
    });
});

const header = [
    'password_sample', 'f_length', 'f_char_class_count', 'f_has_lowercase',
    'f_has_uppercase', 'f_has_digit', 'f_has_symbol', 'f_dictionary_present',
    'f_has_leetspeak', 'f_numeric_prefix', 'f_numeric_suffix', 'f_numeric_infix',
    'f_has_sequence', 'f_has_repetition', 'f_rule_pattern_present',
    'recommendation_label'
];

let out = header.join(',') + '\n';
rows.forEach(r => {
    out += [
        r.password_sample, r.length, r.character_class_count, r.has_lowercase,
        r.has_uppercase, r.has_digit, r.has_symbol, r.dictionary_present,
        r.has_leetspeak, r.numeric_prefix, r.numeric_suffix, r.numeric_infix,
        r.has_sequence, r.has_repetition, r.rule_pattern_present,
        r.recommendation_label
    ].join(',') + '\n';
});

fs.writeFileSync(outputPath, out);

const counts = {};
rows.forEach(r => { counts[r.recommendation_label] = (counts[r.recommendation_label] || 0) + 1; });

console.log(`✅ recommendation_dataset.csv generated with ${rows.length} rows.`);
console.log('Class distribution:', counts);