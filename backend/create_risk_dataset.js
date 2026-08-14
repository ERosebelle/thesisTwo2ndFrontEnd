/* CREATE RISK DATASET
Reads the existing 12-feature dataset.csv (the same one used to train the
vulnerability-type classifier) and derives a risk label for every row, then
writes risk_dataset.csv. train_risk_model.js then trains a SEPARATE CART
classifier on this file.

Why derive labels this way instead of hand-labeling each row:
The security-score formula below is the same one already used in server.js's
calculateSecurityScore() for the password_comparison feature - length and
character-class diversity add points, dictionary/rule-pattern/sequence/
repetition subtract points. Reusing it keeps risk labeling consistent with
security logic already validated elsewhere in the system, instead of
introducing a second, disconnected notion of "risk".

LABELING METHOD - percentile-based (terciles), not fixed score thresholds:
Fixed thresholds (e.g. "CRITICAL if score < -10") produce whatever class
counts the raw score distribution happens to produce - for this dataset that
was a lopsided 261/253/86 split, since very few samples happened to score
below -10. To get an even, balanced 200/200/200 split regardless of the
score distribution's shape, all 600 samples are ranked by score and cut into
three equal-sized groups: the bottom third (worst scores) = CRITICAL, the
middle third = HIGH, the top third (best scores) = MODERATE. This keeps the
UNDERLYING signal (the same security-score formula) while guaranteeing
balanced classes for training. */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'dataset.csv');
const outputPath = path.join(__dirname, 'risk_dataset.csv');

// Minimal CSV parser - no external dependency needed. dataset.csv has no
// quoted/escaped commas in any field, so a plain split is safe here.
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

function calculateSecurityScore(f) {
    let score = 0;
    score += f.length;
    score += f.character_class_count * 10;
    if (f.dictionary_present) score -= 20;
    if (f.rule_pattern_present) score -= 15;
    if (f.has_sequence) score -= 10;
    if (f.has_repetition) score -= 10;
    return score;
}

const rows = [];
const inputText = fs.readFileSync(inputPath, 'utf-8');
const parsedRows = parseCsv(inputText);

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

    const score = calculateSecurityScore(features);

    rows.push({
        password_sample: row.password_sample,
        ...features,
        security_score: score
    });
});

/* TERCILE SPLIT: sort ascending by score (worst first), then cut into three
equal-sized groups by RANK rather than by a fixed score value. This is what
guarantees exactly 200/200/200 (for a 600-row dataset) regardless of how the
raw scores are distributed. */
const sortedByScore = [...rows].sort((a, b) => a.security_score - b.security_score);
const groupSize = Math.floor(sortedByScore.length / 3);

sortedByScore.forEach((row, rank) => {
    if (rank < groupSize) {
        row.risk_label = "CRITICAL";
    } else if (rank < groupSize * 2) {
        row.risk_label = "HIGH";
    } else {
        row.risk_label = "MODERATE";
    }
});

const header = [
    'password_sample', 'f_length', 'f_char_class_count', 'f_has_lowercase',
    'f_has_uppercase', 'f_has_digit', 'f_has_symbol', 'f_dictionary_present',
    'f_has_leetspeak', 'f_numeric_suffix', 'f_has_sequence', 'f_has_repetition',
    'f_rule_pattern_present', 'security_score', 'risk_label'
];

let out = header.join(',') + '\n';
rows.forEach(r => {
    out += [
        r.password_sample, r.length, r.character_class_count, r.has_lowercase,
        r.has_uppercase, r.has_digit, r.has_symbol, r.dictionary_present,
        r.has_leetspeak, r.numeric_suffix, r.has_sequence, r.has_repetition,
        r.rule_pattern_present, r.security_score, r.risk_label
    ].join(',') + '\n';
});

fs.writeFileSync(outputPath, out);

const counts = {};
rows.forEach(r => { counts[r.risk_label] = (counts[r.risk_label] || 0) + 1; });

console.log(`✅ risk_dataset.csv generated with ${rows.length} rows.`);
console.log('Class distribution:', counts);