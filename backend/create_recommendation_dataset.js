/* CREATE RECOMMENDATION DATASET
Reads the existing 12-feature dataset.csv (the same one used to train the
vulnerability-type classifier) and derives a recommendation_label for every
row, then writes recommendation_dataset.csv. train_recommendation_model.js
then trains a THIRD, SEPARATE CART classifier on this file - server.js will
load all three (model.json, risk_model.json, recommendation_model.json) and
run a password through each independently. */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'dataset.csv');
const outputPath = path.join(__dirname, 'recommendation_dataset.csv');

// Minimal CSV parser - dataset.csv has no quoted/escaped commas, so a plain
// split is safe here (same approach as create_risk_dataset.js).
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

// Labels, in priority order (used to break ties when two deficits are equal).
// KEEP_IT_UP was removed - the system must always return an actionable
// suggestion, even for an already-strong password (see pickLabel below).
const LABELS = [
    "AVOID_DICTIONARY_WORDS",   // 0
    "AVOID_PREDICTABLE_PATTERNS", // 1
    "ADD_CHARACTER_VARIETY",   // 2
    "INCREASE_LENGTH"          // 3
];

const LENGTH_TARGET = 12;   // same 12-char standard already used in getStrategies()
const CLASS_TARGET = 3;     // same threshold already used in getStrategies()

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

    // Sort by value desc; priority order above breaks ties since it's a stable sort.
    ranked.sort((a, b) => b.value - a.value);

    if (ranked[0].value === 0) {
        // No deficit in ANY of the four dimensions - the password already
        // clears every threshold. The system must still return an
        // actionable suggestion (KEEP_IT_UP was removed as a label), so it
        // defaults to INCREASE_LENGTH here: unlike character_class_count
        // (which caps out at 4 - there's nothing left to add once all four
        // types are present) or the two binary pattern/dictionary flags
        // (already satisfied, nothing more to give), length has NO upper
        // cap on how much extra protection it adds. It's the one dimension
        // where "good" can always still become "better".
        return "INCREASE_LENGTH";
    }
    return ranked[0].label;
}

const inputText = fs.readFileSync(inputPath, 'utf-8');
const parsedRows = parseCsv(inputText);
const rows = [];

parsedRows.forEach((row) => {
    const features = {
        length: Number(row.f_length),
        character_class_count: Number(row.f_char_class_count),
        has_lowercase: Number(row.f_has_lowercase),
        has_uppercase: Number(row.f_has_uppercase),
        has_digit: Number(row.f_has_digit),
        has_symbol: Number(row.f_has_symbol),
        dictionary_present: Number(row.f_dictionary_present),
        has_leetspeak: Number(row.f_has_leetspeak),
        numeric_suffix: Number(row.f_numeric_suffix),
        has_sequence: Number(row.f_has_sequence),
        has_repetition: Number(row.f_has_repetition),
        rule_pattern_present: Number(row.f_rule_pattern_present)
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
    'f_has_leetspeak', 'f_numeric_suffix', 'f_has_sequence', 'f_has_repetition',
    'f_rule_pattern_present', 'recommendation_label'
];

let out = header.join(',') + '\n';
rows.forEach(r => {
    out += [
        r.password_sample, r.length, r.character_class_count, r.has_lowercase,
        r.has_uppercase, r.has_digit, r.has_symbol, r.dictionary_present,
        r.has_leetspeak, r.numeric_suffix, r.has_sequence, r.has_repetition,
        r.rule_pattern_present, r.recommendation_label
    ].join(',') + '\n';
});

fs.writeFileSync(outputPath, out);

const counts = {};
rows.forEach(r => { counts[r.recommendation_label] = (counts[r.recommendation_label] || 0) + 1; });

console.log(`✅ recommendation_dataset.csv generated with ${rows.length} rows.`);
console.log('Class distribution:', counts);