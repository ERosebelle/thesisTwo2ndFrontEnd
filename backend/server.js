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

// Expanded Leet Normalization (Kasama na ang '(' -> 'c', '3' -> 'e', etc.)
function normalizeLeet(str) {
    return str.toLowerCase()
        .replace(/[@4]/g, 'a')
        .replace(/0/g, 'o')
        .replace(/[\$5]/g, 's')
        .replace(/3/g, 'e')
        .replace(/[1!|]/g, 'i')
        .replace(/[\(\[\<]/g, 'c')
        .replace(/[7\+]/g, 't')
        .replace(/8/g, 'b');
}

// Dynamic Sequence Detector (Gumagana sa pataas/pababa: abc, cba, 123, 321, xyz, zyx, etc.)
function checkSequence(str) {
    const s = str.toLowerCase();
    if (s.length < 3) return 0;

    for (let i = 0; i < s.length - 2; i++) {
        const c1 = s.charCodeAt(i);
        const c2 = s.charCodeAt(i + 1);
        const c3 = s.charCodeAt(i + 2);

        const isDigit = (c) => c >= 48 && c <= 57;
        const isAlpha = (c) => c >= 97 && c <= 122;

        if ((isDigit(c1) && isDigit(c2) && isDigit(c3)) || (isAlpha(c1) && isAlpha(c2) && isAlpha(c3))) {
            if ((c2 === c1 + 1 && c3 === c2 + 1) || (c2 === c1 - 1 && c3 === c2 - 1)) {
                return 1;
            }
        }
    }
    return 0;
}

// ===== 1. FEATURE EXTRACTION (FIXED) =====
function extractFeatures(password) {
    const originalPassword = password;

    // --- NUMERIC POSITIONS ---
    const numericPrefix = /^\d+/.test(originalPassword) ? 1 : 0;
    const numericSuffix = /\d+$/.test(originalPassword) ? 1 : 0;
    const middlePart = originalPassword.replace(/^\d+/, '').replace(/\d+$/, '');
    const numericInfix = /\d+/.test(middlePart) ? 1 : 0;

    // --- CAMELCASE SPLITTING ---
    const camelSplit = originalPassword.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

    // --- LEET NORMALIZATION ---
    const leetNormalized = normalizeLeet(camelSplit);
    const alphaTokens = leetNormalized.split(/[^a-z]+/).filter(Boolean);

    let dictionaryDetected = 0;
    let matchedWords = [];
    let totalMatchedLength = 0;
    let longestMatch = "";

    // --- ACCURATE DICTIONARY MATCHING ---
    for (const token of alphaTokens) {
        if (token.length < 3) continue;

        if (englishSet.has(token) || tagalogSet.has(token)) {
            matchedWords.push(token);
            totalMatchedLength += token.length;
            if (token.length > longestMatch.length) longestMatch = token;
            continue;
        }

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
    const strippedMiddle = originalPassword.replace(/^\d+/, '').replace(/\d+$/, '');

    const hasEmbeddedLeet = /([a-zA-Z][@$40531!\(\[\<+]|[a-zA-Z0-9][@$!\(\[\<+][a-zA-Z0-9]|[@$40531!\(\[\<+][a-zA-Z])/.test(strippedMiddle);

    const rawTokens = camelSplit.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const rawMatched = rawTokens.some(t => englishSet.has(t) || tagalogSet.has(t));

    const hasLeetspeak = dictionaryDetected && (hasEmbeddedLeet || (!rawMatched && /[@$40531!\(\[\<+]/.test(strippedMiddle))) ? 1 : 0;

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
        has_sequence: checkSequence(originalPassword),
        has_repetition: /(.)\1|(.{2,})\2+/i.test(originalPassword) ? 1 : 0,
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
        return "MODERATE";
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

    const riskMap = {
        0: "CRITICAL",
        1: "HIGH",
        2: "MODERATE"
    };

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

function buildRiskModelRationale(features, level, vulnerabilityType) {
    // 1. Pattern Detection Sentence
    const detected = [];
    const notDetected = [];

    if (features.dictionary_present) detected.push("A dictionary word"); else notDetected.push("dictionary word");
    if (features.numeric_suffix) detected.push("a number at the end"); else notDetected.push("numeric suffix");
    if (features.has_sequence) detected.push("a sequential pattern"); else notDetected.push("sequence");
    if (features.has_leetspeak) detected.push("leetspeak"); else notDetected.push("leetspeak");
    if (features.numeric_prefix) detected.push("numeric prefix"); else notDetected.push("numeric prefix");
    if (features.numeric_infix) detected.push("numeric infix"); else notDetected.push("numeric infix");
    if (features.has_repetition) detected.push("repeated characters"); else notDetected.push("repetition");

    let detectionSentence = "";
    if (features.dictionary_present) {
        if (detected.length === 1) {
            detectionSentence = `A dictionary word was detected, while no ${notDetected.join(", ")} was found.`;
        } else {
            const detectedStr = detected.join(", ");
            detectionSentence = `${detectedStr} were detected, while no ${notDetected.filter(d => d !== 'dictionary word').join(", ")} were found.`;
        }
    } else if (features.numeric_infix && !features.dictionary_present) {
        detectionSentence = `No dictionary word, leetspeak, numeric prefix or suffix, sequence, or repeated characters were detected. Numbers were found in the middle of the password,`;
    } else if (detected.length === 0) {
        detectionSentence = "No dictionary word, leetspeak, numeric prefix or suffix, sequence, or repeated characters were detected.";
    } else {
        detectionSentence = `${detected.join(", ")} was detected, while no ${notDetected.join(", ")} were found.`;
    }

    // 2. Character Classes Sentence
    const presentClasses = [];
    const missingClasses = [];

    if (features.has_lowercase) presentClasses.push("lowercase letters"); else missingClasses.push("uppercase letters, numbers, or symbols");
    if (features.has_uppercase) presentClasses.push("uppercase letters");
    if (features.has_digit) presentClasses.push("digits");
    if (features.has_symbol) presentClasses.push("symbols");

    let charSentence = "";
    const charCount = features.character_class_count;
    const charGuideline = charCount >= 3 
        ? "which meets the system guideline." 
        : "which is below the system guideline of 3.";

    if (charCount === 1) {
        charSentence = `and the password contains ${presentClasses.join(", ")} but no ${missingClasses.join(", ")}, resulting in only 1 character type, ${charGuideline}`;
    } else {
        charSentence = `and the password contains ${presentClasses.join(", ")}, giving it ${charCount} character types, ${charGuideline}`;
    }

    // 3. Length Sentence
    const len = features.length;
    const lenGuideline = len >= 12 
        ? `meets the 12-character guideline.` 
        : `is below the system guideline of at least 12 characters.`;
    const lengthSentence = `Its length of ${len} characters ${lenGuideline}`;

    // 4. Conclusion Sentence
    let conclusion = "";
    if (level === "CRITICAL") {
        conclusion = "but the combination of the detected dictionary word and limited character variety led the trained model to classify it as CRITICAL risk.";
    } else if (level === "HIGH") {
        conclusion = "However, the combination of a recognizable word and predictable modification patterns led the trained model to classify it as HIGH risk.";
    } else if (level === "MODERATE" && vulnerabilityType === "BRUTE-FORCE") {
        conclusion = `Although a rule-based pattern was detected, the overall combination of extracted features and the decision path of the trained model resulted in the BRUTE-FORCE classification and a MODERATE risk rating.`;
    } else {
        conclusion = `Combined, these feature checks support the trained risk model's final rating of ${level} risk.`;
    }

    return `The system examined all 14 extracted password features. ${detectionSentence} ${charSentence} ${lengthSentence} ${conclusion}`;
}

function explainRisk(features, level, treeRoot, vulnerabilityType) {
    const contributions = [];

    contributions.push(`+${features.length} points from password length (${features.length} characters).`);
    contributions.push(`+${features.character_class_count * 10} points from using ${features.character_class_count} character class${features.character_class_count === 1 ? "" : "es"} (lowercase/uppercase/digits/symbols).`);

    if (features.dictionary_present) contributions.push("-20 points: a dictionary word was detected.");
    if (features.rule_pattern_present) contributions.push("-15 points: a predictable rule-based pattern was detected (leetspeak, numeric suffix, sequence, or repetition).");
    if (features.has_sequence) contributions.push("-10 points: a sequential pattern (e.g. abc, 123) was detected.");
    if (features.has_repetition) contributions.push("-10 points: repeated characters were detected.");

    const score = calculateSecurityScore(features);
    const modelSteps = buildManualFeatureSteps(features);
    const summary = buildRiskModelRationale(features, level, vulnerabilityType);

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
        if (f.has_leetspeak) stacked.push("substituting letters with symbols");
        if (f.numeric_suffix) stacked.push("adding a number at the end");
        const stackedNote = stacked.length > 0
            ? ` Even with ${stacked.join(" and ")}, automated guessing tools can still easily recognize the main word underneath.`
            : "";

        return pickVariant([
            `'${password}' contains a recognizable word that automated guessing tools usually check first.${stackedNote} ` +
            `A passphrase like "${passphrase}" - made from unrelated words - creates a much less predictable password.`,
           
            `Dictionary-based guessing software checks common words, and '${password}' contains one.${stackedNote} ` +
            `Consider replacing it with something like "${passphrase}" - combining unrelated words creates a stronger structure.`,
           
            `The main part of '${password}' matches a word found in common password lists.${stackedNote} ` +
            `Consider a multi-word passphrase such as "${passphrase}" - using unrelated words creates a longer and harder-to-guess password.`
        ]);
    },

    AVOID_PREDICTABLE_PATTERNS: (f, password) => {
        const found = [];
        if (f.has_leetspeak) found.push("swapping letters for symbols (like a→@)");
        if (f.numeric_suffix) found.push("adding a number at the end");
        if (f.has_sequence) found.push("using a sequence like 123 or abc");
        if (f.has_repetition) found.push("repeating characters");
        const whatWasFound = found.length > 0 ? found.join(", ") : "a common modification pattern";

        return pickVariant([
            `'${password}' contains ${whatWasFound}. Automated guessing tools check these exact tricks after looking for whole words. ` +
            `Consider changing the arrangement of your numbers, symbols, and letters instead of placing them only at the beginning or end.`,
           
            `We noticed ${whatWasFound} in '${password}'. These are predictable changes that automated password-guessing tools test automatically. ` +
            `Try mixing numbers and symbols into different parts of the password instead of putting them only at the ends.`,
           
            `The pattern in '${password}' (${whatWasFound}) is a common modification that password-cracking tools test right away. ` +
            `Consider creating a completely random combination rather than just adding extra characters to a basic word.`
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
            `'${password}' uses ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"} of characters.${missingNote} ` +
            `Consider using at least ${target} types (uppercase, lowercase, numbers, and symbols) to create more variety and make it harder to guess.`,
           
            `Character variety in '${password}' is limited to ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"}.${missingNote} ` +
            `Adding the missing character types creates many more possibilities, making automated guessing much harder.`,
           
            `With only ${f.character_class_count} character type${f.character_class_count === 1 ? "" : "s"} in use, '${password}' has limited variety.${missingNote} ` +
            `Consider combining at least ${target} types to create a more varied and less predictable password.`
        ]);
    },

    INCREASE_LENGTH: (f, password) => {
        const target = MANUAL_TREE_THRESHOLDS.length;
        const remaining = Math.max(0, target - f.length);
        const remainingNote = remaining > 0
            ? ` That's ${remaining} more character${remaining === 1 ? "" : "s"} to reach the ${target}-character recommendation used by the system.`
            : ` It already meets the ${target}-character recommendation, but extra length still makes it exponentially stronger.`;

        return pickVariant([
            `'${password}' is ${f.length} character${f.length === 1 ? "" : "s"} long.${remainingNote} ` +
            `Adding more characters increases the time and effort required for automated tools to guess it.`,
           
            `At ${f.length} character${f.length === 1 ? "" : "s"}, '${password}' has room to grow.${remainingNote} ` +
            `Consider making it longer to increase the number of possible combinations.`,
           
            `'${password}' currently has ${f.length} character${f.length === 1 ? "" : "s"}.${remainingNote} ` +
            `Consider extending it by adding an extra random word or phrase, avoiding simple or obvious additions.`
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
        technicalBreakdown.attack_vector = `Automated tools try common words first during dictionary guessing, and '${currentPassword}' contains a recognizable word found in standard password lists.`;
        technicalBreakdown.remediation = `Consider replacing it with a passphrase made from a few unrelated words.`;
    } else if (vulnerabilityType === "RULE-BASED") {
        technicalBreakdown.attack_vector = `'${currentPassword}' contains a familiar word with a predictable modification, such as numbers, symbols, or capitalization. Automated cracking tools test these exact patterns automatically.`;
        technicalBreakdown.remediation = `Consider changing the predictable pattern by mixing symbols and numbers into different parts of the password, rather than placing them only at the start or end.`;
    } else if (vulnerabilityType === "BRUTE-FORCE") {
        technicalBreakdown.attack_vector = `'${currentPassword}' does not match a recognizable word or common pattern. Automated tools must test combinations of characters to guess it.`;
        technicalBreakdown.remediation = `Consider making it longer and using different types of characters to create a less predictable structure.`;
    }

    if (recommendationResult && recommendationResult.label) {
        tips.push("Consider enabling Multi-Factor Authentication (MFA) to add an extra verification step if someone discovers your password.");
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
            tips.push("Consider using a password manager to create and store unique passwords for each account, helping you avoid reusing passwords.");
        }
    }

    if (recommendationResult && recommendationResult.label) {
        const similarGuesses = generateSimilarGuessablePasswords(currentPassword, extractedFeatures);
        if (similarGuesses.core) {
            tips.push(
                `Your password's structure is similar to common guessing patterns: starting with a base like '${similarGuesses.core}' and trying variations like '${similarGuesses.examples.join("', '")}'. ` +
                `Automated cracking tools automatically test these exact variations.`
            );
        } else {
            tips.push(
                `How automated guessing software works: Software generates combinations that follow the same pattern as your password (${extractedFeatures.length} characters using its current mix). Examples: '${similarGuesses.examples.join("', ")}'.`
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
            `Classified as DICTIONARY because the system detected a recognizable dictionary word ` +
            `(dictionary_present = 1) ${extractedFeatures.rule_pattern_present + "No common rule-based patterns, such as leetspeak, numbers at the beginning or end, sequences, or repeated characters, were detected"}. ` +
            `Although the password is (${extractedFeatures.length}) long, it only uses (${extractedFeatures.character_class_count}) type of character. ` +
            `The trained model gives important consideration to the presence of a dictionary word, which led to the DICTIONARY classification.`;
    } else if (vulnerabilityType === "RULE-BASED") {
        const patternsFound = [];
        if (extractedFeatures.has_leetspeak) patternsFound.push("leetspeak substitution");
        if (extractedFeatures.numeric_suffix) patternsFound.push("numeric suffix");
        if (extractedFeatures.has_sequence) patternsFound.push("sequential characters");
        if (extractedFeatures.has_repetition) patternsFound.push("repeated characters");

        classification_rationale =
            `Classified as RULE-BASED because the system detected a dictionary word (dictionary_present = 1) ` +
            `together with predictable adjustments  (rule_pattern_present = 1)` +
            `${patternsFound.length > 0 ? `. specifically: ${patternsFound.join(", ")}` : ""}. ` +
            `This means the password is based on a recognizable word with common changes that password-cracking tools may also try, which led to the RULE-BASED classification.`;
    } else if (vulnerabilityType === "BRUTE-FORCE") {
        classification_rationale =
            `Classified as BRUTE-FORCE because the system did not detect a recognizable dictionary word (dictionary_present = 0), ` +
            `Instead, the password's classification is mainly associated with its length and combination of character types. ` +
            `The password is  ${extractedFeatures.length} characters long and uses ${extractedFeatures.character_class_count} character type${extractedFeatures.character_class_count === 1 ? "" : "es"}, ` +
            `which means the system evaluates its characteristics mainly in relation to the number of possible combinations that may need to be considered during brute-force guessing.`;
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
    const riskExplanation = explainRisk(extractedFeatures, currentRiskLevel, riskModel ? riskModel.root : null, classificationResult.label);

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