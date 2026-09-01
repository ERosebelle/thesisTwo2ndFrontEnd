const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { DecisionTreeClassifier } = require("ml-cart");
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

// ===== LOAD ML MODEL =====
const model = JSON.parse(fs.readFileSync(path.join(__dirname, "model.json")));

const classifier = DecisionTreeClassifier.load(model);
console.log("✅ ML model loaded");

// ===== LOAD RISK MODEL =====
let riskModel = null;
let riskClassifier = null;
try {
    riskModel = JSON.parse(fs.readFileSync(path.join(__dirname, "risk_model.json")));
    riskClassifier = DecisionTreeClassifier.load(riskModel);
    console.log("✅ Risk model loaded");
} catch (err) {
    console.log("⚠️ risk_model.json not found - run create_risk_dataset.js then train_risk_model.js to generate it. Risk level will be unavailable until then.");
}

// ===== LOAD RECOMMENDATION MODEL =====
let recommendationModel = null;
let recommendationClassifier = null;
try {
    recommendationModel = JSON.parse(
        fs.readFileSync(path.join(__dirname, "recommendation_model.json"))
    );
    recommendationClassifier = DecisionTreeClassifier.load(recommendationModel);
    console.log("✅ Recommendation model loaded");
} catch (err) {
    console.log("⚠️ recommendation_model.json not found - run create_recommendation_dataset.js then train_recommendation_model.js to generate it. Recommendations will fall back to a simple message until then.");
}

// ===== LOAD DATASET =====
let trainingDataset = [];
const datasetPath = path.join(__dirname, 'dataset.csv');

// ===== LOAD DICTIONARIES =====
let englishSet = new Set();
let tagalogSet = new Set();

try {
    const engData = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, 'words_dictionary.json'),
            'utf-8'
        )
    );

    englishSet = new Set(
        Object.keys(engData).map(word => word.toLowerCase())
    );

    console.log(
        `✅ English dictionary loaded: ${englishSet.size} words`
    );

} catch (err) {
    console.log("❌ Failed to load English dictionary");
}

try {
    const tagData = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, 'tagalog_dictionary.json'),
            'utf-8'
        )
    );

    tagalogSet = new Set(
        tagData.map(entry => entry.word.toLowerCase())
    );

    console.log(
        `✅ Tagalog dictionary loaded: ${tagalogSet.size} words`
    );

} catch (err) {
    console.log("❌ Failed to load Tagalog dictionary");
}

// ===== PASSPHRASE WORD POOL =====
const passphraseWordPool = Array.from(englishSet).filter(
    word => word.length >= 4 && word.length <= 7 && /^[a-z]+$/.test(word)
);
if (passphraseWordPool.length === 0) {
    console.log("⚠️ Passphrase word pool is empty - suggestPassphrase() will fall back to generic words.");
}

// ===== LOAD CSV DATASET =====
fs.createReadStream(datasetPath)
    .pipe(csv())
    .on('data', (row) => trainingDataset.push(row))
    .on('end', () => {
        console.log(
            `✅ Dataset loaded: ${trainingDataset.length} samples ready for reference.`
        );
    })
    .on('error', () => {
        console.error("❌ Warning: dataset.csv not found.");
    });

// ===== 1. FEATURE EXTRACTION (FIXED) =====
function extractFeatures(password) {
    const originalPassword = password;

    // --- NUMERIC POSITIONS ---
    const numericPrefix = /^\d+/.test(originalPassword) ? 1 : 0;
    const numericSuffix = /\d+$/.test(originalPassword) ? 1 : 0;
    const middlePart = originalPassword.replace(/^\d+/, '').replace(/\d+$/, '');
    const numericInfix = /\d+/.test(middlePart) ? 1 : 0;

    // --- CAMELCASE & COMPOUND WORD SPLITTING ---
    const camelSplit = originalPassword.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

    // --- LEET NORMALIZATION ---
    const normalizeLeet = (str) => str.toLowerCase()
        .replace(/@/g, 'a')
        .replace(/4/g, 'a')
        .replace(/0/g, 'o')
        .replace(/\$/g, 's')
        .replace(/5/g, 's')
        .replace(/3/g, 'e')
        .replace(/1/g, 'i')
        .replace(/!/g, 'i');

    const leetNormalized = normalizeLeet(camelSplit);
    const alphaTokens = leetNormalized.split(/[^a-z]+/).filter(Boolean);

    let dictionaryDetected = 0;
    let matchedWords = [];
    let totalMatchedLength = 0;
    let longestMatch = "";

    // --- ACCURATE DICTIONARY MATCHING ---
    for (const token of alphaTokens) {
        if (token.length < 3) continue;

        // Exact token match
        if (englishSet.has(token) || tagalogSet.has(token)) {
            matchedWords.push(token);
            totalMatchedLength += token.length;
            if (token.length > longestMatch.length) longestMatch = token;
            continue;
        }

        // Substring search within token (Longest Match first)
        let longestSub = "";
        for (let i = 0; i < token.length; i++) {
            for (let j = i + 3; j <= token.length; j++) {
                const sub = token.slice(i, j);
                if ((englishSet.has(sub) || tagalogSet.has(sub)) && sub.length > longestSub.length) {
                    longestSub = sub;
                }
            }
        }

        if (longestSub.length >= 3) {
            matchedWords.push(longestSub);
            totalMatchedLength += longestSub.length;
            if (longestSub.length > longestMatch.length) longestMatch = longestSub;
        }
    }

    const coverageRatio = originalPassword.length > 0 ? (totalMatchedLength / originalPassword.length) : 0;
    if (matchedWords.length > 0 && (coverageRatio >= 0.30 || totalMatchedLength >= 4)) {
        dictionaryDetected = 1;
    }

    // --- PRECISE LEETSPEAK DETECTION ---
    // Inaalis ang prefix/suffix numbers para hindi ma-flag ang trailing '123' bilang leetspeak
    const strippedMiddle = originalPassword.replace(/^\d+/, '').replace(/\d+$/, '');

    // Tinitingnan kung may leet chars na nakapaloob o katabi ng mga titik
    const hasEmbeddedLeet = /([a-zA-Z][@$40531!]|[a-zA-Z0-9][@$!][a-zA-Z0-9]|[@$40531!][a-zA-Z])/.test(strippedMiddle);

    // Tinitingnan kung kinailangan ang leet normalization para mahanap ang dictionary word
    const rawTokens = camelSplit.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const rawMatched = rawTokens.some(t => englishSet.has(t) || tagalogSet.has(t));

    const hasLeetspeak = dictionaryDetected && (hasEmbeddedLeet || (!rawMatched && /[@$40531!]/.test(strippedMiddle))) ? 1 : 0;

    const extractedFeatures = {
        length: originalPassword.length,
        has_lowercase: /[a-z]/.test(originalPassword) ? 1 : 0,
        has_uppercase: /[A-Z]/.test(originalPassword) ? 1 : 0,
        has_digit: /\d/.test(originalPassword) ? 1 : 0,
        has_symbol: /[^A-Za-z0-9]/.test(originalPassword) ? 1 : 0,
        dictionary_present: dictionaryDetected,
        has_leetspeak: hasLeetspeak,
        numeric_prefix: numericPrefix,
        numeric_suffix: numericSuffix,
        numeric_infix: numericInfix,
        has_sequence: /(abc|123|bcd|234)/i.test(originalPassword) ? 1 : 0,
        has_repetition: (/(.)\1{2,}/.test(originalPassword) || /(.{2,4})\1+/.test(originalPassword)) ? 1 : 0,
        _matched_dictionary_word: dictionaryDetected ? matchedWords.join(", ") : ""
    };

    extractedFeatures.character_class_count =
        extractedFeatures.has_lowercase +
        extractedFeatures.has_uppercase +
        extractedFeatures.has_digit +
        extractedFeatures.has_symbol;

    extractedFeatures.rule_pattern_present = (
        extractedFeatures.has_sequence ||
        extractedFeatures.has_repetition ||
        extractedFeatures.numeric_prefix ||
        extractedFeatures.numeric_suffix ||
        extractedFeatures.numeric_infix ||
        (extractedFeatures.has_leetspeak && extractedFeatures.dictionary_present)
    ) ? 1 : 0;

    return extractedFeatures;
}

// ===== PASSWORD COMPARISON =====
function calculateSecurityScore(features) {
    let score = 0;
    score += features.length * 2;
    score += features.character_class_count * 8;
    if (features.dictionary_present) score -= 20;
    if (features.has_leetspeak) score -= 5;
    if (features.rule_pattern_present) score -= 15;
    if (features.has_sequence) score -= 10;
    if (features.has_repetition) score -= 10;
    return score;
}

function comparePasswords(currentFeatures, previousFeatures, currentRiskLevel, previousRiskLevel) {
    const riskRank = { "CRITICAL": 0, "HIGH": 1, "MODERATE": 2 };
    
    const scoreCurrent = calculateSecurityScore(currentFeatures);
    const scorePrevious = calculateSecurityScore(previousFeatures);

    // 1. Unahing ihambing ang ML Risk Level
    if (riskRank[currentRiskLevel] > riskRank[previousRiskLevel]) {
        return {
            status: "CURRENT_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message: "Your current password has a safer ML risk classification compared to your previous password."
        };
    }

    if (riskRank[currentRiskLevel] < riskRank[previousRiskLevel]) {
        return {
            status: "PREVIOUS_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message: "Your previous password has a safer ML risk classification compared to your current password."
        };
    }

    // 2. Kapag pareho ang Risk Level, gamitin ang Security Score bilang tie-breaker
    if (scoreCurrent > scorePrevious) {
        return {
            status: "CURRENT_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message: "Your current password has favorable security characteristics compared to your previous password."
        };
    }

    if (scorePrevious > scoreCurrent) {
        return {
            status: "PREVIOUS_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message: "Your previous password has favorable security characteristics compared to your current password."
        };
    }

    return {
        status: "SIMILAR",
        current_score: scoreCurrent,
        previous_score: scorePrevious,
        message: "Your current and previous passwords have similar security characteristics."
    };
}

// ===== 2. PASSWORD CLASSIFICATION =====
function classifyPassword(extractedFeatures) {
    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_prefix,
        extractedFeatures.numeric_suffix,
        extractedFeatures.numeric_infix,
        extractedFeatures.has_sequence,
        extractedFeatures.has_repetition,
        extractedFeatures.rule_pattern_present
    ]];

    console.log("MODEL FEATURES:", modelFeatures);
    const prediction = classifier.predict(modelFeatures);
    console.log("RAW PREDICTION:", prediction);

    const labelMap = {
        0: "DICTIONARY",
        1: "RULE-BASED",
        2: "BRUTE-FORCE"
    };

    let finalLabel = labelMap[prediction[0]];

    // Safety Override: Pure dictionary words without rules shouldn't drift to Rule-Based/Brute-Force
    if (extractedFeatures.dictionary_present === 1 && extractedFeatures.rule_pattern_present === 0) {
        finalLabel = "DICTIONARY";
    }

    return {
        label: finalLabel,
        path: [
            "Your password has been analyzed based on its structure and patterns",
            `Prediction: ${finalLabel}`
        ]
    };
}

// ===== 2b. RISK LEVEL CLASSIFICATION =====
function classifyRisk(extractedFeatures) {
    if (!riskClassifier) {
        console.error("❌ Risk classifier model is not loaded.");
        return "MODERATE"; // Fallback kapag hindi pa na-load ang model
    }

    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_prefix,
        extractedFeatures.numeric_suffix,
        extractedFeatures.numeric_infix,
        extractedFeatures.has_sequence,
        extractedFeatures.has_repetition,
        extractedFeatures.rule_pattern_present
    ]];

    const rawPrediction = riskClassifier.predict(modelFeatures);
    const predictedIndex = Number(rawPrediction[0]);

    // Numeric Index -> Risk String Label
    const riskMap = {
        0: "CRITICAL",
        1: "HIGH",
        2: "MODERATE"
    };

    // Siguraduhing may fallback sakaling mag-out-of-bounds ang index
    return riskMap[predictedIndex] || "MODERATE";
}

// ===== 2c. RECOMMENDATION CLASSIFICATION =====
function classifyRecommendation(extractedFeatures) {
    if (!recommendationClassifier) {
        return { label: null, steps: [] };
    }

    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_prefix,
        extractedFeatures.numeric_suffix,
        extractedFeatures.numeric_infix,
        extractedFeatures.has_sequence,
        extractedFeatures.has_repetition,
        extractedFeatures.rule_pattern_present
    ]];

    const prediction = recommendationClassifier.predict(modelFeatures);

    const recommendationLabelMap = {
        0: "AVOID_DICTIONARY_WORDS",
        1: "AVOID_PREDICTABLE_PATTERNS",
        2: "ADD_CHARACTER_VARIETY",
        3: "INCREASE_LENGTH",
        4: "INCREASE_LENGTH"
    };

    const label = recommendationLabelMap[prediction[0]] || null;
    const steps = buildManualFeatureSteps(extractedFeatures);

    return { label, steps };
}

function buildManualFeatureSteps(extractedFeatures) {
    const steps = [];

    for (const key of DECISION_TREE_ORDER) {
        const meta = FEATURE_COLUMNS.find((f) => f.key === key);
        if (!meta) continue;

        const threshold = MANUAL_TREE_THRESHOLDS[meta.key] ?? 1;
        const actualValue = extractedFeatures[meta.key];
        const tookRight = actualValue >= threshold;

        steps.push({
            feature: meta.key,
            label: FEATURE_LABELS[meta.key],
            threshold: threshold,
            actualValue: actualValue,
            direction: tookRight ? "higher" : "lower",
            explanation: tookRight ? meta.explain.YES : meta.explain.NO
        });
    }

    return steps;
}

function buildRiskModelRationale(steps, level) {
    if (steps.length === 0) {
        return `The risk assessment reached a ${level} risk rating without any features to check.`;
    }

    const stepSentences = steps.map((step, i) => {
        const ordinal = i === 0 ? "First" : (i === steps.length - 1 ? "Finally" : "Next");
        const isNumeric = step.feature === "length" || step.feature === "character_class_count";

        if (isNumeric) {
            const unit = step.feature === "length" ? "character(s)" : "character type(s)";
            const comparison = step.direction === "higher"
                ? `at least the guideline of ${step.threshold} ${unit}`
                : `below the guideline of ${step.threshold} ${unit}`;
            return `${ordinal}, "${step.label}" was checked: your password has ${step.actualValue} ${unit}, which is ${comparison}.`;
        }

        return `${ordinal}, "${step.label}" was checked: ${step.explanation}`;
    });

    return `The risk assessment walked through all ${steps.length} extracted password features. ` +
        stepSentences.join(" ") +
        ` Combined, these feature checks support the trained risk model's final rating of ${level} risk.`;
}

function explainRisk(features, level, treeRoot) {
    const contributions = [];

    contributions.push(`+${features.length} points from password length (${features.length} characters).`);
    contributions.push(`+${features.character_class_count * 10} points from using ${features.character_class_count} character class${features.character_class_count === 1 ? "" : "es"} (lowercase/uppercase/digits/symbols).`);

    if (features.dictionary_present) contributions.push("-20 points: a dictionary word was detected.");
    if (features.rule_pattern_present) contributions.push("-15 points: a predictable rule-based pattern was detected (leetspeak, numeric suffix, sequence, or repetition).");
    if (features.has_sequence) contributions.push("-10 points: a sequential pattern (e.g. abc, 123) was detected.");
    if (features.has_repetition) contributions.push("-10 points: repeated characters were detected.");

    const score = calculateSecurityScore(features);
    const modelSteps = buildManualFeatureSteps(features);
    const summary = buildRiskModelRationale(modelSteps, level);

    return {
        risk_level: level,
        security_score: score,
        summary,
        model_decision_steps: modelSteps,
        contributing_factors: contributions
    };
}

const MANUAL_TREE_THRESHOLDS = {
    length: 12,
    character_class_count: 3
};

function computeRuntimeDeficits(f) {
    return {
        AVOID_DICTIONARY_WORDS: f.dictionary_present ? 20 : 0,
        AVOID_PREDICTABLE_PATTERNS: f.rule_pattern_present ? 15 : 0,
        ADD_CHARACTER_VARIETY: Math.max(0, MANUAL_TREE_THRESHOLDS.character_class_count - f.character_class_count) * 10,
        INCREASE_LENGTH: Math.max(0, MANUAL_TREE_THRESHOLDS.length - f.length) * 1
    };
}

function pickSecondRecommendationLabel(extractedFeatures, topLabel) {
    const deficits = computeRuntimeDeficits(extractedFeatures);
    const ranked = Object.entries(deficits)
        .filter(([label]) => label !== topLabel)
        .sort((a, b) => b[1] - a[1]);

    if (ranked.length === 0 || ranked[0][1] === 0) {
        return null;
    }
    return ranked[0][0];
}

function generateSimilarGuessablePasswords(password, extractedFeatures) {
    if (!extractedFeatures.dictionary_present || !extractedFeatures._matched_dictionary_word) {
        const symbols = ['!', '@', '#', '$', '%', '&', '*'];
        const digits = '0123456789';
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        function randChar(str) { return str[Math.floor(Math.random() * str.length)]; }

        const len = Math.min(Math.max(extractedFeatures.length, 4), 20);
        const pools = [];
        if (extractedFeatures.has_lowercase) pools.push(lower);
        if (extractedFeatures.has_uppercase) pools.push(upper);
        if (extractedFeatures.has_digit) pools.push(digits);
        if (extractedFeatures.has_symbol) pools.push(symbols);
        if (pools.length === 0) pools.push(lower);
        const combinedPool = pools.join('');

        const examples = [];
        for (let i = 0; i < 3; i++) {
            let s = '';
            for (let j = 0; j < len; j++) s += randChar(combinedPool);
            examples.push(s);
        }
        return { core: null, examples };
    }

    const core = extractedFeatures._matched_dictionary_word.split(", ")[0];
    const titleCase = core.charAt(0).toUpperCase() + core.slice(1);

    const leet = s => s.replace(/a/g, '@').replace(/o/g, '0').replace(/e/g, '3').replace(/i/g, '1').replace(/s/g, '$');
    const symbols = ['!', '@', '#', '$', '%', '&', '*'];
    const years = ['2024', '2025', '1995', '2000', '2010'];
    const randOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

    const recipes = [
        () => `${core}${randDigits(3)}`,
        () => `${core}${randDigits(1)}`,
        () => `${leet(core)}${randDigits(3)}`,
        () => `${titleCase}${randOf(symbols)}`,
        () => `${titleCase}${randDigits(2)}`,
        () => `${randOf(symbols)}${core}${randDigits(2)}`,
        () => `${core}${core}`,
        () => `${core.split('').reverse().join('')}`,
        () => `${core}${randOf(years)}`,
        () => `${core}${randOf(symbols)}${randDigits(2)}`,
        () => `${leet(titleCase)}`,
        () => `${titleCase}${core.slice(0, 2)}${randDigits(1)}`
    ];

    const shuffled = [...recipes].sort(() => Math.random() - 0.5);
    const examples = shuffled.slice(0, 3).map(recipe => recipe());

    return { core, examples };
}

function pickVariant(variants) {
    return variants[Math.floor(Math.random() * variants.length)];
}

const RECOMMENDATION_LABEL_TEMPLATES = {
    AVOID_DICTIONARY_WORDS: (f, password) => {
        const passphrase = suggestPassphrase();
        const stacked = [];
        if (f.has_leetspeak) stacked.push("letter-to-symbol swaps");
        if (f.numeric_suffix) stacked.push("a number tacked on the end");
        const stackedNote = stacked.length > 0
            ? ` Even with ${stacked.join(" and ")}, the underlying word is still the first thing a cracking tool checks.`
            : "";

        return pickVariant([
            `'${password}' is built around a real word, which is the very first thing attackers try.${stackedNote} ` +
            `A passphrase like "${passphrase}" - unrelated words strung together - is far harder to guess.`,
            `Dictionary attacks check real words before anything else, and '${password}' is one.${stackedNote} ` +
            `Try replacing it with something like "${passphrase}" instead - random, unrelated words beat a single word every time.`,
            `The core of '${password}' matches a word cracking tools already have in their list.${stackedNote} ` +
            `Consider a multi-word passphrase such as "${passphrase}" - length and unpredictability matter more than using a "real" word.`
        ]);
    },

    AVOID_PREDICTABLE_PATTERNS: (f, password) => {
        const found = [];
        if (f.has_leetspeak) found.push("letter-to-symbol swaps (like a→@)");
        if (f.numeric_suffix) found.push("a number stuck at the end");
        if (f.has_sequence) found.push("a sequence like 123 or abc");
        if (f.has_repetition) found.push("repeated characters");
        const whatWasFound = found.length > 0 ? found.join(", ") : "a common modification pattern";

        return pickVariant([
            `'${password}' contains ${whatWasFound} - these are the first tricks cracking tools test right after plain words. ` +
            `Try placing your symbols and numbers in the middle of the password instead of just at the start or end.`,
            `We noticed ${whatWasFound} in '${password}'. Automated tools try these exact tweaks first, so they add less protection than they feel like they do. ` +
            `Mixing changes into the middle of the password, not just the edges, makes it noticeably harder to predict.`,
            `The pattern in '${password}' (${whatWasFound}) is one of the first things a password cracker checks after trying the plain word. ` +
            `Breaking up the predictable part - rather than just appending to it - would make a bigger difference.`
        ]);
    },

    ADD_CHARACTER_VARIETY: (f, password) => {
        const target = MANUAL_TREE_THRESHOLDS.character_class_count;

        const missing = [];
        if (!f.has_uppercase) missing.push("uppercase letters");
        if (!f.has_lowercase) missing.push("lowercase letters");
        if (!f.has_digit) missing.push("numbers");
        if (!f.has_symbol) missing.push("symbols");
        const missingNote = missing.length > 0
            ? ` Right now it's missing: ${missing.join(", ")}.`
            : "";

        return pickVariant([
            `'${password}' only uses ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"} of characters.${missingNote} ` +
            `Aim for at least ${target} types (uppercase, lowercase, numbers, symbols) to make guessing much harder.`,
            `Character variety in '${password}' is limited to ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"}.${missingNote} ` +
            `Mixing in the missing types pushes the total combinations an attacker has to try up dramatically.`,
            `With only ${f.character_class_count} character type${f.character_class_count === 1 ? "" : "s"} in use, '${password}' has less variety than it could.${missingNote} ` +
            `Passwords that combine at least ${target} types are significantly more resistant to guessing.`
        ]);
    },

    INCREASE_LENGTH: (f, password) => {
        const target = MANUAL_TREE_THRESHOLDS.length;
        const remaining = Math.max(0, target - f.length);
        const remainingNote = remaining > 0
            ? ` That's ${remaining} more character${remaining === 1 ? "" : "s"} to reach a safer length.`
            : ` It already meets the usual ${target}-character guideline, but there's no upper limit on how much extra length helps.`;

        return pickVariant([
            `'${password}' is ${f.length} character${f.length === 1 ? "" : "s"} long.${remainingNote} ` +
            `Every extra character makes brute-force guessing exponentially harder.`,
            `At ${f.length} character${f.length === 1 ? "" : "s"}, '${password}' has room to grow.${remainingNote} ` +
            `Length adds more protection per character than almost any other change you can make.`,
            `'${password}' currently sits at ${f.length} character${f.length === 1 ? "" : "s"}.${remainingNote} ` +
            `Stretching it out - even by adding a short unrelated word or phrase - meaningfully raises how long it would take to crack.`
        ]);
    }
};

function suggestPassphrase() {
    const FALLBACK_WORDS = ["purple", "harbor", "lantern"];
    const symbols = ['!', '@', '#', '$', '%', '&', '*'];

    let words;
    if (passphraseWordPool.length >= 3) {
        const picked = new Set();
        while (picked.size < 3) {
            const candidate = passphraseWordPool[Math.floor(Math.random() * passphraseWordPool.length)];
            picked.add(candidate);
        }
        words = Array.from(picked);
    } else {
        words = FALLBACK_WORDS;
    }

    const capitalized = words.map(w => w.charAt(0).toUpperCase() + w.slice(1));
    const randomNumber = Math.floor(Math.random() * 90) + 10;
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

    return `${capitalized.join('-')}-${randomNumber}${randomSymbol}`;
}

function getStrategies(vulnerabilityType, extractedFeatures, password, treeRoot, classificationRationale, recommendationResult) {
    let tips = [];
    let technicalBreakdown = {
        vulnerability_explanation: classificationRationale || "",
        attack_vector: "",
        remediation: ""
    };

    const currentPassword = password;

    if (vulnerabilityType === "DICTIONARY") {
        technicalBreakdown.attack_vector = `Attackers try common words first, and '${currentPassword}' matches one directly.`;
        technicalBreakdown.remediation = `Replace it with a passphrase made of a few random, unrelated words.`;
    } else if (vulnerabilityType === "RULE-BASED") {
        technicalBreakdown.attack_vector = `'${currentPassword}' is a common word with a predictable tweak (numbers, symbols, or capitalization) - cracking tools test these tweaks automatically.`;
        technicalBreakdown.remediation = `Break the predictable pattern - mix symbols and numbers into the middle of the password, not just the start or end.`;
    } else if (vulnerabilityType === "BRUTE-FORCE") {
        const isStrong = extractedFeatures.length >= 12 && extractedFeatures.character_class_count >= 3;
        technicalBreakdown.attack_vector = isStrong
            ? `'${currentPassword}' doesn't match a word or pattern, and it's long and varied enough to resist most guessing attempts.`
            : `'${currentPassword}' doesn't match a word or pattern, but it's still short enough that a computer could eventually guess it through brute force.`;
        technicalBreakdown.remediation = `Make it longer - each extra character makes brute-force guessing exponentially harder.`;
    }

    if (recommendationResult && recommendationResult.label) {
        tips.push("Consider turning on Multi-Factor Authentication (MFA) wherever this password is used, as an extra layer of protection.");
    }

    if (recommendationResult && recommendationResult.label && RECOMMENDATION_LABEL_TEMPLATES[recommendationResult.label]) {
        tips.push(
            RECOMMENDATION_LABEL_TEMPLATES[recommendationResult.label](extractedFeatures, currentPassword)
        );
    } else {
        tips.push("Recommendation model is unavailable right now - run create_recommendation_dataset.js then train_recommendation_model.js to enable personalized tips.");
    }

    if (recommendationResult && recommendationResult.label) {
        const secondLabel = pickSecondRecommendationLabel(extractedFeatures, recommendationResult.label);
        if (secondLabel && RECOMMENDATION_LABEL_TEMPLATES[secondLabel]) {
            tips.push(
                "Additionally: " + RECOMMENDATION_LABEL_TEMPLATES[secondLabel](extractedFeatures, currentPassword)
            );
        } else {
            tips.push("Consider using a password manager to generate and store unique, complex passwords for every account, so you never have to reuse or simplify one.");
        }
    }

    if (recommendationResult && recommendationResult.label) {
        const similarGuesses = generateSimilarGuessablePasswords(currentPassword, extractedFeatures);
        if (similarGuesses.core) {
            tips.push(
                `Your password's structure is similar to how attackers generate guesses: taking a base like '${similarGuesses.core}' and trying '${similarGuesses.examples.join("', '")}'. ` +
                `Wordlist-plus-rules cracking tools try exactly this kind of variation automatically.`
            );
        } else {
            tips.push(
                `How guessing software works: Software can generate random combinations matching your password's exact pattern (${extractedFeatures.length} characters using its current mix). Examples: '${similarGuesses.examples.join("', '")}'.`
            );
        }
    }

    return { tips, technicalBreakdown };
}

const FEATURE_LABELS = {
    length: "Length",
    has_lowercase: "Has Lowercase",
    has_uppercase: "Has Uppercase",
    has_digit: "Has Digit",
    has_symbol: "Has Symbol",
    dictionary_present: "Dictionary Present",
    has_leetspeak: "Has Leetspeak",
    numeric_prefix: "Numeric Prefix",
    numeric_suffix: "Numeric Suffix",
    numeric_infix: "Numeric Substring / Infix",
    has_sequence: "Has Sequence",
    has_repetition: "Has Repetition",
    character_class_count: "Character Class Count",
    rule_pattern_present: "Rule Pattern Present"
};

const FEATURE_COLUMNS = [
    {
        key: "length",
        question: (t) => `Length >= ${Math.round(t)}?`,
        explain: { YES: "Password length meets the standard requirement.", NO: "Password is too short." }
    },
    {
        key: "character_class_count",
        question: (t) => `Character Class Count >= ${Math.round(t)}?`,
        explain: { YES: "Sufficient variety of character types.", NO: "Insufficient variety of character types." }
    },
    { key: "has_lowercase", question: () => "Lowercase Letters", explain: { YES: "Contains lowercase letters.", NO: "No lowercase letters." } },
    { key: "has_uppercase", question: () => "Uppercase Letters", explain: { YES: "Contains uppercase letters.", NO: "No uppercase letters." } },
    { key: "has_digit", question: () => "Digits", explain: { YES: "Contains digits.", NO: "No digits." } },
    { key: "has_symbol", question: () => "Symbols", explain: { YES: "Contains symbols.", NO: "No symbols." } },
    { key: "dictionary_present", question: () => "Dictionary Word", branchLabels: ["Present", "Not Present"], explain: { YES: "Dictionary word detected.", NO: "No dictionary word detected." } },
    { key: "has_leetspeak", question: () => "Leetspeak", explain: { YES: "Leetspeak pattern detected.", NO: "No leetspeak pattern detected." } },
    { key: "numeric_prefix", question: () => "Numeric Prefix", explain: { YES: "Contains numbers at the beginning (prefix).", NO: "No numbers at the beginning." } },
    { key: "numeric_suffix", question: () => "Numeric Suffix", explain: { YES: "Contains numbers at the end (suffix).", NO: "No numbers at the end." } },
    { key: "numeric_infix", question: () => "Numeric Substring / Infix", explain: { YES: "Contains numbers in the middle (infix).", NO: "No numbers in the middle." } },
    { key: "has_sequence", question: () => "Sequential Pattern", explain: { YES: "Contains sequential patterns (e.g., 123, abc).", NO: "No sequential patterns." } },
    { key: "has_repetition", question: () => "Repetition Pattern", explain: { YES: "Contains repeated characters.", NO: "No repeated characters." } },
    { key: "rule_pattern_present", question: () => "Rule-Based Pattern", explain: { YES: "Rule-based pattern detected.", NO: "No rule-based pattern detected." } }
];

const DECISION_TREE_ORDER = [
    "dictionary_present",
    "has_leetspeak",
    "numeric_prefix",
    "numeric_suffix",
    "numeric_infix",
    "has_sequence",
    "has_repetition",
    "has_lowercase",
    "has_uppercase",
    "has_digit",
    "has_symbol",
    "character_class_count",
    "length",
    "rule_pattern_present"
];

const AGGREGATE_FEATURE_BREAKDOWN = {
    character_class_count: ["has_lowercase", "has_uppercase", "has_digit", "has_symbol"],
    rule_pattern_present: ["has_leetspeak", "numeric_suffix", "has_sequence", "has_repetition"]
};

function buildAggregateBreakdown(featureKey, extractedFeatures) {
    const subKeys = AGGREGATE_FEATURE_BREAKDOWN[featureKey];
    if (!subKeys) return null;

    return subKeys.map((subKey) => {
        const meta = FEATURE_COLUMNS.find((f) => f.key === subKey);
        const present = extractedFeatures[subKey] === 1;
        return {
            feature: subKey,
            label: FEATURE_LABELS[subKey],
            present: present,
            explanation: meta ? (present ? meta.explain.YES : meta.explain.NO) : ""
        };
    });
}

function explainClassification(extractedFeatures, vulnerabilityType) {
    const LABELS = FEATURE_LABELS;
    const NUMERIC_KEYS = new Set(["length", "character_class_count"]);

    const feature_checklist = FEATURE_COLUMNS.map((meta) => {
        const value = extractedFeatures[meta.key];

        if (NUMERIC_KEYS.has(meta.key)) {
            return {
                feature: meta.key,
                label: LABELS[meta.key],
                value: value,
                explanation: meta.key === "length"
                    ? `Password length is ${value} character${value === 1 ? "" : "s"}.`
                    : `Password uses ${value} character class${value === 1 ? "" : "es"} (out of 4 possible: lowercase, uppercase, digit, symbol).`
            };
        }

        const present = value === 1;
        return {
            feature: meta.key,
            label: LABELS[meta.key],
            value: present,
            explanation: present ? meta.explain.YES : meta.explain.NO
        };
    });

    let classification_rationale;

    if (vulnerabilityType === "DICTIONARY") {
        classification_rationale =
            `Classified as DICTIONARY primarily because a recognizable dictionary word was detected ` +
            `(dictionary_present = 1) ${extractedFeatures.rule_pattern_present ? "with no strong enough rule-based obfuscation pattern to shift it into RULE-BASED" : "and no rule-based obfuscation pattern (leetspeak, numeric suffix, sequence, or repetition) was detected"}. ` +
            `Length (${extractedFeatures.length}) and character class count (${extractedFeatures.character_class_count}) were not enough by themselves to outweigh the dictionary match, ` +
            `since dictionary_present is the strongest single signal the trained model relies on.`;
    } else if (vulnerabilityType === "RULE-BASED") {
        const patternsFound = [];
        if (extractedFeatures.has_leetspeak) patternsFound.push("leetspeak substitution");
        if (extractedFeatures.numeric_suffix) patternsFound.push("numeric suffix");
        if (extractedFeatures.has_sequence) patternsFound.push("sequential characters");
        if (extractedFeatures.has_repetition) patternsFound.push("repeated characters");

        classification_rationale =
            `Classified as RULE-BASED because a dictionary word was detected (dictionary_present = 1) ` +
            `AND a predictable rule-based pattern was also present (rule_pattern_present = 1)` +
            `${patternsFound.length > 0 ? `, specifically: ${patternsFound.join(", ")}` : ""}. ` +
            `This combination - a real word plus a common human modification habit - is what separates RULE-BASED from a plain DICTIONARY match.`;
    } else if (vulnerabilityType === "BRUTE-FORCE") {
        classification_rationale =
            `Classified as BRUTE-FORCE because no dictionary word was detected (dictionary_present = 0), ` +
            `meaning the password does not match a known word the model can key off of. ` +
            `With length ${extractedFeatures.length} and ${extractedFeatures.character_class_count} character class${extractedFeatures.character_class_count === 1 ? "" : "es"} in use, ` +
            `security here depends on the password's combinatorial search space rather than dictionary or rule-based predictability.`;
    } else {
        classification_rationale = `Classification result: ${vulnerabilityType}.`;
    }

    return { feature_checklist, classification_rationale };
}

function buildManualDecisionPath(extractedFeatures, finalLabel) {
    function leaf(label) {
        return {
            name: label,
            type: "result",
            final: true,
            result: label,
            on_path: true
        };
    }

    function previewNode(nextMeta) {
        if (!nextMeta) {
            return { name: "Result", type: "preview", on_path: false, children: [] };
        }
        return {
            name: nextMeta.question(MANUAL_TREE_THRESHOLDS[nextMeta.key] ?? 1),
            type: "preview",
            feature: nextMeta.key,
            on_path: false,
            children: []
        };
    }

    function decisionNode(meta, answer, breakdown, nextChild, nextMeta) {
        const threshold = MANUAL_TREE_THRESHOLDS[meta.key] ?? 1;
        const [yesLabel, noLabel] = meta.branchLabels || ["Yes", "No"];
        const preview = previewNode(nextMeta);

        return {
            name: meta.question(threshold),
            type: "decision",
            feature: meta.key,
            value: answer === "YES" ? 1 : 0,
            decision: answer,
            explanation: { YES: meta.explain.YES, NO: meta.explain.NO },
            breakdown: breakdown || null,
            on_path: true,
            children: [
                {
                    name: yesLabel,
                    branch: "YES",
                    taken: answer === "YES",
                    explanation: meta.explain.YES,
                    children: [answer === "YES" ? nextChild : preview]
                },
                {
                    name: noLabel,
                    branch: "NO",
                    taken: answer === "NO",
                    explanation: meta.explain.NO,
                    children: [answer === "NO" ? nextChild : preview]
                }
            ]
        };
    }

    let node = leaf(finalLabel);
    let nextMeta = null;
    for (let i = DECISION_TREE_ORDER.length - 1; i >= 0; i--) {
        const key = DECISION_TREE_ORDER[i];
        const meta = FEATURE_COLUMNS.find((f) => f.key === key);
        if (!meta) continue;

        const threshold = MANUAL_TREE_THRESHOLDS[meta.key] ?? 1;
        const actualValue = extractedFeatures[meta.key];
        const answer = actualValue >= threshold ? "YES" : "NO";
        const breakdown = buildAggregateBreakdown(meta.key, extractedFeatures);
        node = decisionNode(meta, answer, breakdown, node, nextMeta);
        nextMeta = meta;
    }

    return node;
}

// ===== API ROUTE =====
app.post('/analyze', (req, res) => {
    const { password, previousPassword } = req.body;

    if (!password) {
        return res.status(400).json({ error: "Password is required" });
    }
    const extractedFeatures = extractFeatures(password);
    console.log("FEATURES:", extractedFeatures);

    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_prefix,
        extractedFeatures.numeric_suffix,
        extractedFeatures.numeric_infix,
        extractedFeatures.has_sequence,
        extractedFeatures.has_repetition,
        extractedFeatures.rule_pattern_present
    ]];

    // Kuhanin ang Risk Level ng kasalukuyang password bago gamitin sa comparison
    const currentRiskLevel = classifyRisk(extractedFeatures);

    let comparisonResult = null;
    if (previousPassword) {
        const previousFeatures = extractFeatures(previousPassword);
        const previousRiskLevel = classifyRisk(previousFeatures);

        if (password === previousPassword) {
            const identicalScore = calculateSecurityScore(extractedFeatures);
            comparisonResult = {
                status: "IDENTICAL",
                current_score: identicalScore,
                previous_score: identicalScore,
                message: "Your current password is identical to your previous password, so they share the exact same security characteristics."
            };
        } else {
            comparisonResult = comparePasswords(
                extractedFeatures,
                previousFeatures,
                currentRiskLevel,
                previousRiskLevel
            );
        }

        console.log("PREVIOUS FEATURES:", previousFeatures);
        console.log("COMPARISON:", comparisonResult);
    }

    const classificationResult = classifyPassword(extractedFeatures);
    const riskExplanation = explainRisk(extractedFeatures, currentRiskLevel, riskModel ? riskModel.root : null);

    console.log("RAW PREDICTION (RISK):", riskClassifier ? riskClassifier.predict(modelFeatures) : "N/A");
    console.log("RISK:", currentRiskLevel);

    const recommendationResult = classifyRecommendation(extractedFeatures);
    console.log("RECOMMENDATION:", recommendationResult.label);

    const fullClassificationExplanation = explainClassification(extractedFeatures, classificationResult.label);

    const { tips, technicalBreakdown } = getStrategies(
        classificationResult.label,
        extractedFeatures,
        password,
        model.root,
        fullClassificationExplanation.classification_rationale,
        recommendationResult
    );

    const actualModelDecisionPath = buildManualDecisionPath(extractedFeatures, classificationResult.label);
    const entropyBits = Math.round(password.length * Math.log2(extractedFeatures.character_class_count * 22 || 26));

    console.log("PASSWORD:", password);
    console.log("RESULT:", classificationResult);

    res.json({
        password: password,
        vulnerability: classificationResult.label,
        decision_path: classificationResult.path,
        features: extractedFeatures,
        password_comparison: comparisonResult,
        actual_model_decision_path: actualModelDecisionPath,
        analytics_breakdown: {
            password_length: extractedFeatures.length,
            character_classes_used: extractedFeatures.character_class_count,
            estimated_entropy_bits: entropyBits,
            dictionary_found: extractedFeatures.dictionary_present === 1 ? "Yes" : "No",
            rule_pattern_active: extractedFeatures.rule_pattern_present === 1 ? "Yes" : "No"
        },
        risk_level: currentRiskLevel,
        risk_assessment: riskExplanation,
        recommendation_label: recommendationResult.label,
        classification_explanation: fullClassificationExplanation,
        security_assessment: technicalBreakdown,
        strategies: tips,
        dataset_count: trainingDataset.length
    });
});

app.listen(3000, () => {
    console.log('🚀 ML Backend running on http://localhost:3000');
});