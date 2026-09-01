const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'dataset.csv');
const outputPath = path.join(__dirname, 'risk_dataset.csv');

function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const header = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        header.forEach((col, i) => { row[col] = values[i].trim(); });
        return row;
    });
}

// 1. BINAGO: Idinagdag ang has_leetspeak penalty at inayos ang score weights
function calculateSecurityScore(f) {
    let score = 0;
    score += f.length * 2;
    score += f.character_class_count * 8; // Taasan mula 5 papuntang 8
    if (f.dictionary_present) score -= 20;
    if (f.has_leetspeak) score -= 5;        // Bawasan ang penalty mula 15 papuntang 5
    if (f.rule_pattern_present) score -= 15;
    if (f.has_sequence) score -= 10;
    if (f.has_repetition) score -= 10;
    return score;
}

function assignRiskLabel(score, f) {
    // 1. CRITICAL: Kapag length <= 8, O kapag pure dictionary word na walang numero/simbolo
    if (f.length <= 8 || f.character_class_count === 1) {
        return "CRITICAL";
    }
    if (f.dictionary_present === 1 && (f.character_class_count <= 2 || f.rule_pattern_present === 0)) {
        return "CRITICAL";
    }

    // 2. HIGH: Kapag may dictionary word ngunit may kasamang rules/leetspeak/numbers
    if (f.dictionary_present === 1) {
        return "HIGH";
    }

    // 3. Score-based Fallback
    if (score < 10) {
        return "CRITICAL";
    } else if (score < 25) {
        return "HIGH";
    } else {
        return "MODERATE";
    }
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

    const score = calculateSecurityScore(features);
    // 3. BINAGO: Ipinasa ang 'features' object sa assignRiskLabel
    const riskLabel = assignRiskLabel(score, features);

    rows.push({
        password_sample: row.password_sample,
        ...features,
        security_score: score,
        risk_label: riskLabel
    });
});

const header = [
    'password_sample', 'f_length', 'f_char_class_count', 'f_has_lowercase',
    'f_has_uppercase', 'f_has_digit', 'f_has_symbol', 'f_dictionary_present',
    'f_has_leetspeak', 'f_numeric_prefix', 'f_numeric_suffix', 'f_numeric_infix',
    'f_has_sequence', 'f_has_repetition', 'f_rule_pattern_present',
    'security_score', 'risk_label'
];

let out = header.join(',') + '\n';
rows.forEach(r => {
    out += [
        r.password_sample, r.length, r.character_class_count, r.has_lowercase,
        r.has_uppercase, r.has_digit, r.has_symbol, r.dictionary_present,
        r.has_leetspeak, r.numeric_prefix, r.numeric_suffix, r.numeric_infix,
        r.has_sequence, r.has_repetition, r.rule_pattern_present,
        r.security_score, r.risk_label
    ].join(',') + '\n';
});

fs.writeFileSync(outputPath, out);
console.log(`✅ risk_dataset.csv updated with ${rows.length} rows.`);