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
// Separate CART classifier trained on risk_dataset.csv (risk_label:
// LOW/MODERATE/HIGH/CRITICAL) - see create_risk_dataset.js / train_risk_model.js.
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
// Third, separate CART classifier trained on recommendation_dataset.csv
// (recommendation_label: AVOID_DICTIONARY_WORDS / AVOID_PREDICTABLE_PATTERNS /
// ADD_CHARACTER_VARIETY / INCREASE_LENGTH - 4 classes) - see
// create_recommendation_dataset.js / train_recommendation_model.js.
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

// ===== PASSPHRASE WORD POOL (for suggestPassphrase, built once at startup) =====
// A short, easy-to-type word length range (4-7 letters), alphabetic only (no
// stray entries with apostrophes/numbers that some word-list dictionaries
// include). Built once here instead of on every suggestPassphrase() call,
// since scanning the full ~370k-word englishSet each time would be wasteful.
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

// ===== 1. FEATURE EXTRACTION =====
function extractFeatures(password) {
    const originalPassword = password;
    const leetNormalized = originalPassword
        .toLowerCase()
        .replace(/@/g, 'a')
        .replace(/4/g, 'a')
        .replace(/0/g, 'o')
        .replace(/\$/g, 's')
        .replace(/5/g, 's')
        .replace(/3/g, 'e')
        .replace(/1/g, 'i')
        .replace(/!/g, 'i');

    // ===== DICTIONARY DETECTION WITH RATIO SAFETY GUARD =====
    // Split into alphabetic runs first (digits, hyphens, symbols, parentheses
    // all act as separators) BEFORE checking for dictionary words. This is
    // what lets passphrase-style passwords like "Hello-World-2026!" or
    // "HelloP@ssw0-rd123(2026)-2026!" still be recognized as dictionary-based
    // even when punctuation/numbers split the words apart or inflate the
    // total length - previously only the SINGLE longest match was measured
    // against the FULL password length, so any separator diluted the ratio
    // below threshold even when the password was built entirely out of real
    // words.
    let dictionaryDetected = 0;
    // Tracks the actual matched word (not just the boolean) - used only to
    // build realistic "similar password" examples in the recommendation
    // section (generateSimilarGuessablePasswords). Never returned to the
    // frontend directly and never influences the detection logic above.
    let matchedDictionaryWord = "";

    // 1. FAST: Exact match on the whole normalized string (Laging 100% tama)
    if (englishSet.has(leetNormalized) || tagalogSet.has(leetNormalized)) {
        dictionaryDetected = 1;
        matchedDictionaryWord = leetNormalized;
    } else {
        const alphaTokens = leetNormalized.split(/[^a-z]+/).filter(Boolean);

        // exactMatchCount: a WHOLE token (or whole adjacent-token merge)
        // equals a real dictionary word - a strong signal, since a random
        // string coincidentally forming an ENTIRE separate word is rare.
        // longestSingleMatch: the single longest match found anywhere
        // (whole-token OR substring-within-token/merge) - used only for the
        // individual ratio/length safety check below, kept separate from any
        // cumulative sum since summing several coincidental SUBSTRING hits
        // together can cross a "looks safe" length threshold purely by
        // chance in a long-enough random string (verified case: a 43-char
        // random string coincidentally contained both "sasa" and "safar" as
        // substrings, which together summed past the old threshold).
        let exactMatchCount = 0;
        let longestSingleMatch = 0;

        for (const token of alphaTokens) {
            if (token.length < 4) continue;

            // Exact token match first (whole word between separators)
            if (englishSet.has(token) || tagalogSet.has(token)) {
                exactMatchCount++;
                if (token.length > longestSingleMatch) matchedDictionaryWord = token;
                longestSingleMatch = Math.max(longestSingleMatch, token.length);
                continue;
            }

            // Fallback: substring check WITHIN this token only (handles a
            // dictionary word glued to extra letters inside one run, e.g.
            // "helloo" or "xhelloz") - counted only toward longestSingleMatch,
            // NOT exactMatchCount, since "contains a word" is a much weaker
            // signal than "IS a word".
            let longestInToken = 0;
            let longestInTokenWord = "";

            for (let word of englishSet) {
                if (word.length >= 4 && token.includes(word) && word.length > longestInToken) {
                    longestInToken = word.length;
                    longestInTokenWord = word;
                }
            }

            if (longestInToken === 0) {
                for (let word of tagalogSet) {
                    if (word.length >= 4 && token.includes(word) && word.length > longestInToken) {
                        longestInToken = word.length;
                        longestInTokenWord = word;
                    }
                }
            }

            if (longestInToken >= 4) {
                if (longestInToken > longestSingleMatch) matchedDictionaryWord = longestInTokenWord;
                longestSingleMatch = Math.max(longestSingleMatch, longestInToken);
            }
        }

        // Also try merging each pair of ADJACENT tokens (i.e. pretend the
        // one separator between them wasn't there) - catches a dictionary
        // word split mid-word by a single hyphen/digit, e.g. "passwo" +
        // "rd" from "passw0-rd" -> "password".
        for (let i = 0; i < alphaTokens.length - 1; i++) {
            const left = alphaTokens[i];
            const right = alphaTokens[i + 1];
            const merged = left + right;
            if (merged.length < 4) continue;

            if (englishSet.has(merged) || tagalogSet.has(merged)) {
                exactMatchCount++;
                if (merged.length > longestSingleMatch) matchedDictionaryWord = merged;
                longestSingleMatch = Math.max(longestSingleMatch, merged.length);
                continue;
            }

            // Substring check on the merge too - counted only toward
            // longestSingleMatch, same reasoning as the single-token pass
            // above. Only counts a match that genuinely SPANS the token
            // boundary (not already fully contained inside `left` or
            // `right` alone) to avoid double-counting a match already
            // found during the single-token pass.
            let longestInMerge = 0;
            let longestInMergeWord = "";
            for (let word of englishSet) {
                if (word.length >= 4 && word.length > longestInMerge &&
                    merged.includes(word) && !left.includes(word) && !right.includes(word)) {
                    longestInMerge = word.length;
                    longestInMergeWord = word;
                }
            }
            if (longestInMerge === 0) {
                for (let word of tagalogSet) {
                    if (word.length >= 4 && word.length > longestInMerge &&
                        merged.includes(word) && !left.includes(word) && !right.includes(word)) {
                        longestInMerge = word.length;
                        longestInMergeWord = word;
                    }
                }
            }
            if (longestInMerge >= 4) {
                if (longestInMerge > longestSingleMatch) matchedDictionaryWord = longestInMergeWord;
                longestSingleMatch = Math.max(longestSingleMatch, longestInMerge);
            }
        }

        if (exactMatchCount >= 2) {
            // Two or more SEPARATE, WHOLE-TOKEN dictionary words (genuine
            // passphrase-style, e.g. "Hello" + "World") - flag it regardless
            // of how much punctuation/digits/length dilute the ratio.
            dictionaryDetected = 1;
        } else if (longestSingleMatch > 0) {
            // At most one strong signal (a single exact match, or only
            // substring-level matches) - apply the density guard using the
            // SINGLE longest match, so a short accidental substring inside a
            // long random string isn't flagged as dictionary-based, and
            // several small coincidental substrings can't sum past the
            // threshold together.
            const wordRatio = longestSingleMatch / originalPassword.length;

            if (wordRatio >= 0.35 || longestSingleMatch >= 6) {
                dictionaryDetected = 1;
            }
        }
    }

    const hasLeetspeak = /[@$40531!]/.test(originalPassword) && dictionaryDetected;
    const extractedFeatures = {
        length: originalPassword.length,
        has_lowercase: /[a-z]/.test(originalPassword) ? 1 : 0,
        has_uppercase: /[A-Z]/.test(originalPassword) ? 1 : 0,
        has_digit: /\d/.test(originalPassword) ? 1 : 0,
        has_symbol: /[^A-Za-z0-9]/.test(originalPassword) ? 1 : 0,
        dictionary_present: dictionaryDetected,
        has_leetspeak: hasLeetspeak ? 1 : 0,
        numeric_suffix: (dictionaryDetected && /\d{2,}$/.test(originalPassword)) ? 1 : 0,
        has_sequence: /(abc|123|bcd|234)/i.test(originalPassword) ? 1 : 0,
        // Catches BOTH a single character repeated 3+ times (e.g. "aaa") AND a
        // 2-4 character syllable/substring immediately repeated (e.g. "huhu",
        // "abcabc") - the original single-char-only regex missed the latter
        // entirely (e.g. "huhuhu" scored as having no repetition at all).
        has_repetition: (/(.)\1{2,}/.test(originalPassword) || /(.{2,4})\1+/.test(originalPassword)) ? 1 : 0,
        // Metadata only - NOT one of the 12 trained features, never sent to
        // the classifiers. Used solely by generateSimilarGuessablePasswords()
        // to build realistic sibling-password examples for the
        // recommendation section.
        _matched_dictionary_word: dictionaryDetected ? matchedDictionaryWord : ""
    };

    extractedFeatures.character_class_count =
        extractedFeatures.has_lowercase +
        extractedFeatures.has_uppercase +
        extractedFeatures.has_digit +
        extractedFeatures.has_symbol;

    extractedFeatures.rule_pattern_present = (
        extractedFeatures.has_sequence ||
        extractedFeatures.has_repetition ||
        (extractedFeatures.numeric_suffix && extractedFeatures.dictionary_present) ||
        (extractedFeatures.has_leetspeak && extractedFeatures.dictionary_present)
    ) ? 1 : 0;

    return extractedFeatures;
}

// ===== PASSWORD COMPARISON =====
function calculateSecurityScore(features) {
    let score = 0;

    // Password length contribution
    score += features.length;

    // Character diversity contribution
    score += features.character_class_count * 10;

    // Vulnerability penalties
    if (features.dictionary_present) {
        score -= 20;
    }

    if (features.rule_pattern_present) {
        score -= 15;
    }

    if (features.has_sequence) {
        score -= 10;
    }

    if (features.has_repetition) {
        score -= 10;
    }
    return score;
}

function comparePasswords(currentFeatures, previousFeatures) {
    const scoreCurrent = calculateSecurityScore(currentFeatures);
    const scorePrevious = calculateSecurityScore(previousFeatures);

    if (scoreCurrent > scorePrevious) {
        return {
            status: "CURRENT_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message:
                "Your current password has stronger security characteristics compared to your previous password."
        };
    }

    if (scorePrevious > scoreCurrent) {
        return {
            status: "PREVIOUS_PREFERRED",
            current_score: scoreCurrent,
            previous_score: scorePrevious,
            message:
                "Your previous password has stronger security characteristics compared to your current password."
        };
    }

    return {
        status: "SIMILAR",
        current_score: scoreCurrent,
        previous_score: scorePrevious,
        message:
            "Your current and previous passwords have similar security characteristics."
    };
}

// ===== 2. PASSWORD CLASSIFICATION =====
function classifyPassword(extractedFeatures) {
    // 🌟 FULL 12 FEATURES PASSED TO MODEL
    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_suffix,
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

    const result = {
        label: finalLabel,
        path: [
            "Your password has been analyzed based on its structure and patterns",
            `Prediction: ${finalLabel}`
        ]
    };

    return result;
}

// ===== 2b. RISK LEVEL CLASSIFICATION (SEPARATE TRAINED MODEL) =====
function classifyRisk(extractedFeatures) {
    if (!riskClassifier) {
        return { level: "UNKNOWN", explanation: "Risk model is not loaded. Run create_risk_dataset.js then train_risk_model.js." };
    }

    // Same 12-feature order as classifyPassword(), since risk_model.json
    // was trained on the same feature columns.
    const modelFeatures = [[
        extractedFeatures.length,
        extractedFeatures.character_class_count,
        extractedFeatures.has_lowercase,
        extractedFeatures.has_uppercase,
        extractedFeatures.has_digit,
        extractedFeatures.has_symbol,
        extractedFeatures.dictionary_present,
        extractedFeatures.has_leetspeak,
        extractedFeatures.numeric_suffix,
        extractedFeatures.has_sequence,
        extractedFeatures.has_repetition,
        extractedFeatures.rule_pattern_present
    ]];

    const prediction = riskClassifier.predict(modelFeatures);

    const riskLabelMap = {
        0: "MODERATE",
        1: "HIGH",
        2: "CRITICAL"
    };

    const level = riskLabelMap[prediction[0]] || "UNKNOWN";

    return { level, explanation: explainRisk(extractedFeatures, level, riskModel.root) };
}

// ===== 2c. RECOMMENDATION CLASSIFICATION (SEPARATE TRAINED MODEL) =====
// Predicts the SINGLE most impactful fix for this password, instead of a
// hand-coded if/else chain on vulnerabilityType. Same 12-feature input as
// the other two models, since recommendation_model.json was trained on the
// same feature columns.
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
        extractedFeatures.numeric_suffix,
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
        // Safety net only: if recommendation_model.json hasn't been
        // retrained yet with the new 4-class dataset (see
        // create_recommendation_dataset.js), the OLD model can still predict
        // index 4 (formerly KEEP_IT_UP). That label was removed, so map it
        // to INCREASE_LENGTH instead of leaving it undefined - the system
        // must always return an actionable suggestion. Once retrained, the
        // new model never outputs index 4, so this line becomes harmless
        // dead code rather than a crash risk.
        4: "INCREASE_LENGTH"
    };

    const label = recommendationLabelMap[prediction[0]] || null;
    const steps = buildManualFeatureSteps(extractedFeatures);

    return { label, steps };
}

/* Builds a transparent, itemized explanation of WHY the risk model landed on
this level, using the exact same scoring contributions calculateSecurityScore()
uses internally (length, character diversity, dictionary/rule-pattern/sequence/
repetition penalties) - so the explanation is traceable to real, computed
numbers rather than a canned sentence per class. */
/* ===== RISK EXPLANATION STEP LIST (MANUAL / RULE-BASED, ALL 12 FEATURES) =====
This used to walk the ACTUAL trained risk tree (riskModel.root), which meant
the explanation could stop after just 2-3 splits - correct, but a very short
and incomplete-feeling walkthrough given that 12 features were extracted for
this password. The FINAL risk_level shown to the user still comes 100% from
the real trained risk classifier's prediction (see classifyRisk() above) -
this function only changes how that result is EXPLAINED: instead of showing
just the handful of splits the tree happened to use, it walks all 12
extracted features, in a fixed order, using the same feature extraction the
model itself was trained on. Nothing here overrides the model's prediction -
it only makes the "why" behind it complete instead of truncated. */
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

/* Turns the real traced steps into a plain-language paragraph - this is what
makes the risk explanation genuinely complete and grounded in this specific
password's features, rather than a parallel hand-coded formula description.

Binary features (dictionary_present, has_repetition, has_digit, etc.) are
always checked against a threshold of 1 (present) vs 0 (absent) - showing
that raw number ("is at or above the reference threshold of 1") explains
nothing to a user. For these, the plain-language YES/NO explanation already
written for this exact outcome (step.explanation) is used instead, with no
threshold mentioned at all. Numeric features (length, character_class_count)
keep a threshold, phrased as a natural whole-number comparison instead of a
raw number. */
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
    // Itemized, formula-based breakdown (calculateSecurityScore) - kept as
    // supplementary detail alongside the model-derived summary below.
    const contributions = [];

    contributions.push(`+${features.length} points from password length (${features.length} characters).`);
    contributions.push(`+${features.character_class_count * 10} points from using ${features.character_class_count} character class${features.character_class_count === 1 ? "" : "es"} (lowercase/uppercase/digits/symbols).`);

    if (features.dictionary_present) {
        contributions.push("-20 points: a dictionary word was detected.");
    }
    if (features.rule_pattern_present) {
        contributions.push("-15 points: a predictable rule-based pattern was detected (leetspeak, numeric suffix, sequence, or repetition).");
    }
    if (features.has_sequence) {
        contributions.push("-10 points: a sequential pattern (e.g. abc, 123) was detected.");
    }
    if (features.has_repetition) {
        contributions.push("-10 points: repeated characters were detected.");
    }

    const score = calculateSecurityScore(features);

    // Full 12-feature manual walkthrough (buildManualFeatureSteps), instead
    // of only whatever handful of splits the trained tree happened to use.
    // The risk_level itself (`level`, passed in) still comes 100% from the
    // real trained risk classifier.
    const modelSteps = buildManualFeatureSteps(features);
    const summary = buildRiskModelRationale(modelSteps, level);

    return {
        risk_level: level,
        security_score: score,
        summary,
        model_decision_steps: modelSteps,
        // Supplementary, formula-based breakdown (calculateSecurityScore) -
        // still useful as an itemized score explanation, but distinct from
        // the feature walkthrough above.
        contributing_factors: contributions
    };
}

/* Fixed, manually-chosen reference thresholds used ONLY for narrating the
step-by-step explanation (buildManualFeatureSteps / buildManualDecisionPath)
and for the "how many more characters/types would help" numbers in the
recommendation templates below. These are NOT learned from any trained
model - they're plain, common-sense security guidelines chosen by hand
(12+ characters, using at least 3 of the 4 character classes). Every binary
feature (has_uppercase, dictionary_present, etc.) simply checks "is it
present" (threshold 1), so it doesn't need an entry here. */
const MANUAL_TREE_THRESHOLDS = {
    length: 12,
    character_class_count: 3
};

/* ===== SECOND-MOST-IMPACTFUL WEAKNESS (runtime deficit ranking) =====
Mirrors the EXACT deficit formula used in create_recommendation_dataset.js to
label the training data (same point values: 20 for dictionary, 15 for
rule-pattern, 10 per missing character class, 1 per missing character of
length), so this runtime ranking never disagrees with what the model was
actually trained to prioritize. Used only to surface a SECOND, genuinely
distinct recommendation alongside the model's top-1 prediction - never used
to override the model's own predicted label. */
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

/* ===== "SIMILAR PASSWORD STRUCTURES" EXAMPLES =====
Illustrates WHY the detected structure is risky by showing 3 example
passwords that share the same underlying pattern - not the user's actual
password, never reconstructable back to it.

- Dictionary-based passwords: builds sibling variants of the ACTUAL matched
  base word (_matched_dictionary_word) by randomly picking 3 DISTINCT
  recipes from a wide pool of real cracking-tool mutation rules (digit
  suffixes, leetspeak, capitalization, symbol padding, year suffixes,
  duplication, reversal) - so repeated analyses don't always show the same
  3 examples.
- Non-dictionary passwords: builds 3 freshly random strings matching the
  SAME shape (length + character classes used) as the analyzed password,
  without reusing a single character of the real one. */
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

    const core = extractedFeatures._matched_dictionary_word;
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


/* This used to be a hand-written if/else chain keyed off vulnerabilityType,
with hardcoded thresholds (12 chars, 3 classes) and dense, jargon-heavy
copy ("combinatorial search space", "Hashcat rules engine", etc). It is now
driven by recommendation_model.json - a THIRD, independently trained CART
classifier (see create_recommendation_dataset.js / train_recommendation_model.js)
that predicts the single most impactful fix for THIS password. The target
numbers quoted ("aim for X characters", "aim for X character types") come
from MANUAL_TREE_THRESHOLDS above - fixed, human-chosen guideline values -
since with a manual/rule-based explanation there's no per-node learned
split to pull a threshold from anymore.

Each label below has SEVERAL phrasing variants (picked at random per request)
instead of one fixed sentence, so two passwords landing on the same label
don't read as an identical, copy-pasted response. Each variant still pulls in
the same real, per-password feature data - the variety is in the sentence
structure, not in inventing new facts.
*/

// Picks one random entry from an array of phrasing variants.
function pickVariant(variants) {
    return variants[Math.floor(Math.random() * variants.length)];
}

const RECOMMENDATION_LABEL_TEMPLATES = {
    AVOID_DICTIONARY_WORDS: (f, password, treeRoot) => {
        const passphrase = suggestPassphrase();
        const stacked = [];
        if (f.has_leetspeak) stacked.push("letter-to-symbol swaps");
        if (f.numeric_suffix) stacked.push("a number tacked on the end");
        const stackedNote = stacked.length > 0
            ? ` Even with ${stacked.join(" and ")}, the underlying word is still the first thing a cracking tool checks.`
            : "";

        return pickVariant([
            `🚨 '${password}' is built around a real word, which is the very first thing attackers try.${stackedNote} ` +
                `A passphrase like "${passphrase}" - unrelated words strung together - is far harder to guess.`,
            `🚨 Dictionary attacks check real words before anything else, and '${password}' is one.${stackedNote} ` +
                `Try replacing it with something like "${passphrase}" instead - random, unrelated words beat a single word every time.`,
            `🚨 The core of '${password}' matches a word cracking tools already have in their list.${stackedNote} ` +
                `Consider a multi-word passphrase such as "${passphrase}" - length and unpredictability matter more than using a "real" word.`
        ]);
    },

    AVOID_PREDICTABLE_PATTERNS: (f, password, treeRoot) => {
        const found = [];
        if (f.has_leetspeak) found.push("letter-to-symbol swaps (like a→@)");
        if (f.numeric_suffix) found.push("a number stuck at the end");
        if (f.has_sequence) found.push("a sequence like 123 or abc");
        if (f.has_repetition) found.push("repeated characters");
        const whatWasFound = found.length > 0 ? found.join(", ") : "a common modification pattern";

        return pickVariant([
            `🔄 '${password}' contains ${whatWasFound} - these are the first tricks cracking tools test right after plain words. ` +
                `Try placing your symbols and numbers in the middle of the password instead of just at the start or end.`,
            `🔄 We noticed ${whatWasFound} in '${password}'. Automated tools try these exact tweaks first, so they add less protection than they feel like they do. ` +
                `Mixing changes into the middle of the password, not just the edges, makes it noticeably harder to predict.`,
            `🔄 The pattern in '${password}' (${whatWasFound}) is one of the first things a password cracker checks after trying the plain word. ` +
                `Breaking up the predictable part - rather than just appending to it - would make a bigger difference.`
        ]);
    },

    ADD_CHARACTER_VARIETY: (f, password, treeRoot) => {
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
            `⚠️ '${password}' only uses ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"} of characters.${missingNote} ` +
                `Aim for at least ${target} types (uppercase, lowercase, numbers, symbols) to make guessing much harder.`,
            `⚠️ Character variety in '${password}' is limited to ${f.character_class_count} type${f.character_class_count === 1 ? "" : "s"}.${missingNote} ` +
                `Mixing in the missing types pushes the total combinations an attacker has to try up dramatically.`,
            `⚠️ With only ${f.character_class_count} character type${f.character_class_count === 1 ? "" : "s"} in use, '${password}' has less variety than it could.${missingNote} ` +
                `Passwords that combine at least ${target} types are significantly more resistant to guessing.`
        ]);
    },

    INCREASE_LENGTH: (f, password, treeRoot) => {
        const target = MANUAL_TREE_THRESHOLDS.length;
        const remaining = Math.max(0, target - f.length);
        const remainingNote = remaining > 0
            ? ` That's ${remaining} more character${remaining === 1 ? "" : "s"} to reach a safer length.`
            : ` It already meets the usual ${target}-character guideline, but there's no upper limit on how much extra length helps.`;

        return pickVariant([
            `📏 '${password}' is ${f.length} character${f.length === 1 ? "" : "s"} long.${remainingNote} ` +
                `Every extra character makes brute-force guessing exponentially harder.`,
            `📏 At ${f.length} character${f.length === 1 ? "" : "s"}, '${password}' has room to grow.${remainingNote} ` +
                `Length adds more protection per character than almost any other change you can make.`,
            `📏 '${password}' currently sits at ${f.length} character${f.length === 1 ? "" : "s"}.${remainingNote} ` +
                `Stretching it out - even by adding a short unrelated word or phrase - meaningfully raises how long it would take to crack.`
        ]);
    }
};

// Builds a genuinely random passphrase suggestion - picks 3 DISTINCT random
// words from the loaded English dictionary (never anything derived from the
// password being analyzed), capitalizes each, joins with hyphens, and adds a
// random 2-digit number + symbol. Every call produces a different result.
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
    const randomNumber = Math.floor(Math.random() * 90) + 10; // 2-digit, 10-99
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

    return `${capitalized.join('-')}-${randomNumber}${randomSymbol}`;
}

function getStrategies(vulnerabilityType, extractedFeatures, password, treeRoot, classificationRationale, recommendationResult) {
    let tips = [];
    let technicalBreakdown = {
        // Real, feature-grounded explanation (from explainClassification's
        // classification_rationale) instead of a static per-class template -
        // this is what actually cites the specific features THIS password
        // triggered, not a generic paragraph that's identical for every
        // password in the same class.
        vulnerability_explanation: classificationRationale || "",
        attack_vector: "",
        remediation: ""
    };

    const currentPassword = password;

    // Simplified, plain-language attack vector / fix summary per class -
    // shorter and jargon-free compared to the old version, still grounded
    // in the real classification for this password.
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

    // ===== 1. ML-DRIVEN PRIMARY RECOMMENDATION =====
    // recommendationResult.label was predicted by recommendation_model.json
    // (a real, independently trained CART classifier) - NOT decided by
    // vulnerabilityType or a hand-written if/else here.
    if (recommendationResult && recommendationResult.label && RECOMMENDATION_LABEL_TEMPLATES[recommendationResult.label]) {
        tips.push(
            RECOMMENDATION_LABEL_TEMPLATES[recommendationResult.label](extractedFeatures, currentPassword, recommendationModel.root)
        );
    } else {
        tips.push("⚠️ Recommendation model is unavailable right now - run create_recommendation_dataset.js then train_recommendation_model.js to enable personalized tips.");
    }

    // ===== 2. SECOND-MOST-IMPACTFUL WEAKNESS =====
    // A genuinely distinct, data-driven second tip - not padding. Reuses the
    // SAME template functions as the primary tip (just a different label),
    // so the wording style stays consistent. Falls back to a generic,
    // still-useful tip only when there is no second real weakness left.
    if (recommendationResult && recommendationResult.label) {
        const secondLabel = pickSecondRecommendationLabel(extractedFeatures, recommendationResult.label);
        if (secondLabel && RECOMMENDATION_LABEL_TEMPLATES[secondLabel]) {
            tips.push(
                "Additionally: " + RECOMMENDATION_LABEL_TEMPLATES[secondLabel](extractedFeatures, currentPassword, recommendationModel.root)
            );
        } else {
            tips.push("🔑 Consider using a password manager to generate and store unique, complex passwords for every account, so you never have to reuse or simplify one.");
        }
    }

    // ===== 3. SIMILAR PASSWORD STRUCTURES =====
    // Shows 3 example passwords sharing the analyzed password's structural
    // pattern (never the real password itself).
    if (recommendationResult && recommendationResult.label) {
        const similarGuesses = generateSimilarGuessablePasswords(currentPassword, extractedFeatures);
        if (similarGuesses.core) {
            tips.push(
                `🎯 Your password's structure is similar to how attackers generate guesses: taking a base like '${similarGuesses.core}' and trying '${similarGuesses.examples.join("', '")}'. ` +
                `Wordlist-plus-rules cracking tools try exactly this kind of variation automatically.`
            );
        } else {
            tips.push(
                `🎯 Your password's shape - ${extractedFeatures.length} characters using its current mix of character types - is easy to regenerate at random. Freshly-generated examples sharing that exact shape: '${similarGuesses.examples.join("', '")}'.`
            );
        }
    }

    // ===== 4. GENERAL SECURITY TIP =====
    // Always shown alongside the model's specific fixes - not a substitute
    // for them.
    if (recommendationResult && recommendationResult.label) {
        tips.push("🛡️ Also consider turning on Multi-Factor Authentication (MFA) wherever this password is used, as an extra layer of protection.");
    }

    return { tips, technicalBreakdown };
}

/* ===== 4. DECISION TREE VISUAL TRACE PATH (NOW SOURCED FROM THE ACTUAL TRAINED MODEL) =====
Previously this built a hand-authored chain of questions with hardcoded thresholds
(length >= 8, character_class_count >= 3, etc.) that never looked at model.json at all.
This version instead walks the REAL trained tree (model.root's splitColumn/splitValue/
left/right nodes, exactly as produced by ml-cart's classifier.toJSON()) so every question
and threshold shown to the user is something the model actually learned from dataset.csv,
not something the developer picked by hand.

FEATURE_COLUMNS below must stay in the exact same order as the 12-element array built in
classifyPassword() / classifyRisk(), since splitColumn is a numeric index into that array. */
const FEATURE_COLUMNS = [
    {
        key: "length",
        question: (t) => `Length >= ${Math.round(t)}?`,
        explain: {
            YES: "The password reached the length threshold the model learned to associate with lower risk. Longer passwords increase the search space.",
            NO: "The password is shorter than the length threshold the model learned. Shorter passwords are easier to guess or brute-force."
        }
    },
    {
        key: "character_class_count",
        question: (t) => `Character Class Count >= ${Math.round(t)}?`,
        explain: {
            YES: "The password mixes enough character categories (upper/lower/digits/symbols) to match the pattern the model associates with lower risk.",
            NO: "The password uses fewer character categories than the threshold the model learned, limiting the possible combinations an attacker has to try."
        }
    },
    {
        key: "has_lowercase",
        question: () => "Lowercase Letters",
        explain: {
            YES: "Lowercase characters were detected, increasing character variety.",
            NO: "No lowercase characters were detected."
        }
    },
    {
        key: "has_uppercase",
        question: () => "Uppercase Letters",
        explain: {
            YES: "Uppercase characters were detected. However, predictable capitalization can still be guessed.",
            NO: "No uppercase characters were detected."
        }
    },
    {
        key: "has_digit",
        question: () => "Digits",
        explain: {
            YES: "Numbers were detected. Digits increase complexity but predictable placement may reduce security.",
            NO: "No digits were detected."
        }
    },
    {
        key: "has_symbol",
        question: () => "Symbols",
        explain: {
            YES: "Special symbols were detected, increasing possible combinations.",
            NO: "No symbols were detected."
        }
    },
    {
        key: "dictionary_present",
        question: () => "Dictionary Word",
        branchLabels: ["Present", "Not Present"],
        explain: {
            YES: "A recognizable dictionary word was detected. Attackers commonly test known words first using wordlists.",
            NO: "No dictionary word was detected. The password does not directly match common words."
        }
    },
    {
        key: "has_leetspeak",
        question: () => "Leetspeak",
        explain: {
            YES: "Leetspeak substitutions were detected, which attackers commonly include in rule-based attacks.",
            NO: "No leetspeak substitution was detected."
        }
    },
    {
        key: "numeric_suffix",
        question: () => "Numeric Suffix",
        explain: {
            YES: "A number suffix was detected after a dictionary word, a common password habit.",
            NO: "No predictable numeric suffix was detected."
        }
    },
    {
        key: "has_sequence",
        question: () => "Sequential Pattern",
        explain: {
            YES: "Sequential patterns like abc or 123 were detected.",
            NO: "No sequential pattern was detected."
        }
    },
    {
        key: "has_repetition",
        question: () => "Repetition Pattern",
        explain: {
            YES: "Repeated characters were detected, reducing randomness.",
            NO: "No repeated character pattern was detected."
        }
    },
    {
        key: "rule_pattern_present",
        question: () => "Rule-Based Pattern",
        explain: {
            YES: "Predictable patterns were detected, such as sequences, repetition, suffix numbers, or substitutions.",
            NO: "No common human-created pattern was detected."
        }
    }
];

// ===== FIXED WALK ORDER FOR THE MANUAL DECISION TREE =====
// This is the order the 12 questions get asked in, in the visual walkthrough
// (buildManualDecisionPath / buildManualFeatureSteps) - NOT the order
// features are indexed in for the trained models above (that indexing stays
// fixed since splitColumn in model.json/risk_model.json refers to it
// numerically, so it can't change). This order instead follows a natural
// investigative flow, matching how a person would actually reason through a
// password: is it built on a real word at all -> how was that word
// disguised/modified (leetspeak, numeric suffix, sequence, repetition) ->
// what raw character composition does it have -> aggregate/summary checks
// last (character class count, length, rule pattern present).
const DECISION_TREE_ORDER = [
    "dictionary_present",
    "has_leetspeak",
    "numeric_suffix",
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

/* ===== FULL 12-FEATURE CLASSIFICATION EXPLANATION =====
The decision tree visualization above intentionally shows only the features
the trained model actually split on (currently 3 of 12: dictionary_present,
character_class_count, rule_pattern_present) - that's the true, honest
picture of what the model itself relied on. It stops early because
gainThreshold causes the CART trainer to stop splitting once further
features stop adding meaningful information gain on this dataset.

This function is different: it checks and explains ALL 12 extracted
features regardless of whether the trained tree happened to split on them,
so the user can see the complete feature picture and a rationale connecting
it to the final classification - independent of how shallow or deep the
tree ended up being. */
// Shared human-readable labels for all 12 features - used by both
// explainClassification() and the tree breakdown feature below.
const FEATURE_LABELS = {
    length: "Length",
    has_lowercase: "Has Lowercase",
    has_uppercase: "Has Uppercase",
    has_digit: "Has Digit",
    has_symbol: "Has Symbol",
    dictionary_present: "Dictionary Present",
    has_leetspeak: "Has Leetspeak",
    numeric_suffix: "Numeric Suffix",
    has_sequence: "Has Sequence",
    has_repetition: "Has Repetition",
    character_class_count: "Character Class Count",
    rule_pattern_present: "Rule Pattern Present"
};

/* Which raw sub-features compose each aggregate feature. character_class_count
is the SUM of these 4 binary flags; rule_pattern_present is the OR of these 4
binary flags (see create_dataset.js's buildFeatures()). Used to give the tree
visualization something real to expand into at the two aggregate-feature
decision nodes, without inventing splits the model didn't actually make. */
const AGGREGATE_FEATURE_BREAKDOWN = {
    character_class_count: ["has_lowercase", "has_uppercase", "has_digit", "has_symbol"],
    rule_pattern_present: ["has_leetspeak", "numeric_suffix", "has_sequence", "has_repetition"]
};

/* Builds the "what's inside this aggregate feature" breakdown for a decision
node, e.g. for character_class_count it lists has_lowercase/has_uppercase/
has_digit/has_symbol with their actual present/absent state for this
password. Returns null for features that aren't aggregates (nothing to
expand). This is purely explanatory - it does not add new decision splits,
just shows the real composition of a real feature the model did split on. */
function buildAggregateBreakdown(featureKey, extractedFeatures) {
    const subKeys = AGGREGATE_FEATURE_BREAKDOWN[featureKey];
    if (!subKeys) {
        return null;
    }

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

    // Numeric (non-binary) features get their raw value shown instead of Present/Not Present.
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

    // Build a rationale paragraph tailored to which class the password landed in,
    // citing the specific features that support that outcome.
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

/* ===== DECISION TREE VISUAL TRACE (MANUAL / RULE-BASED, ALL 12 FEATURES) =====
This used to walk the ACTUAL trained tree (model.root) node by node. That was
100% faithful to what the model learned, but ml-cart's CART trainer stops
splitting once further features stop adding meaningful information gain
(gainThreshold) - on this dataset the real tree only ever asked about 3 of
the 12 extracted features before reaching a leaf. Visually that reads as an
abrupt, unfinished-looking tree even though the prediction itself is correct.

This version instead builds a FIXED, 12-question walkthrough, one node per
extracted feature, always in the same order (FEATURE_COLUMNS), using the
exact same feature extraction (extractFeatures()) that was fed to the real
model. It is a manual/rule-based tree in the sense that the STRUCTURE
(which question comes next) and the reference thresholds (MANUAL_TREE_THRESHOLDS)
are fixed by hand rather than learned - but the ANSWER to every question
(the actual feature value) and the FINAL result at the leaf both still come
from the real thing: extractFeatures() and the trained classifier's
prediction (classifyPassword()) respectively. Nothing about the underlying
decision is invented; only the shape of the explanation is now complete
instead of cut short. */
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

    // A shallow, UNEXPANDED look at what a branch would ask next. Since all
    // 12 questions are asked in the same fixed order no matter what the
    // previous answer was, the "next question" on the branch this password
    // did NOT take is always the exact same question the taken branch asks -
    // we just don't recurse further into it, because this password never
    // actually walked that path, so there's nothing real to report beyond
    // that single next box. This is what keeps the tree a genuine BINARY
    // tree (every branch leads to a node, not a dead end) without literally
    // materializing all 2^12 = 4096 possible leaves.
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
        // Per-feature branch wording - e.g. dictionary_present reads as
        // "Present / Not Present" instead of a generic "Yes / No", matching
        // how each question naturally gets answered.
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
                    // Taken side: the real, fully recursive subtree down to
                    // the leaf. Not-taken side: just a one-level preview of
                    // the next question, so the frontend can still render a
                    // real box there instead of an empty branch.
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

    // Walk DECISION_TREE_ORDER back-to-front so the resulting node, once
    // fully built, has the FIRST question in that order (Dictionary Word) as
    // the root and the real classification result as the deepest leaf - all
    // 12 questions are asked, in that fixed order, every single time,
    // regardless of how shallow the model's own trained tree happened to be.
    // Every node now has TWO real children (a true binary tree shape); only
    // the taken side keeps expanding, the untaken side stops after one
    // preview box (see previewNode() above) instead of dead-ending.
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

    // ===== PREVIOUS PASSWORD COMPARISON =====
    let comparisonResult = null;
    if (previousPassword) {

        const previousFeatures = extractFeatures(previousPassword);

        /*Literal duplicate input (e.g. "1" then "1" again) gets its own clear message instead of the generic "similar" wording,
        which is reserved for two *different* passwords that just happen to score the same.*/
        if (password === previousPassword) {
            const identicalScore = calculateSecurityScore(extractedFeatures);
            comparisonResult = {
                status: "IDENTICAL",
                current_score: identicalScore,
                previous_score: identicalScore,
                message:
                    "Your current password is identical to your previous password, so they share the exact same security characteristics."
            };

        } else {
            comparisonResult = comparePasswords(extractedFeatures, previousFeatures);
        }

        console.log("PREVIOUS FEATURES:", previousFeatures);
        console.log("COMPARISON:", comparisonResult);
    }

    const classificationResult = classifyPassword(extractedFeatures);

    // Risk level, predicted by the SEPARATE trained risk classifier
    const riskResult = classifyRisk(extractedFeatures);
    console.log("RISK:", riskResult.level);

    // Recommendation, predicted by the THIRD, separate trained recommendation
    // classifier (recommendation_model.json) - not derived from vulnerabilityType.
    const recommendationResult = classifyRecommendation(extractedFeatures);
    console.log("RECOMMENDATION:", recommendationResult.label);

    // Full 12-feature checklist + rationale - independent of how shallow the trained tree is.
    // Computed BEFORE getStrategies() now, since its classification_rationale
    // (genuinely grounded in this password's actual feature values) replaces
    // the old static per-class vulnerability_explanation template.
    const fullClassificationExplanation = explainClassification(extractedFeatures, classificationResult.label);

    // Kunin ang pormal at realistic strategies at breakdown - the primary tip
    // is the recommendation model's own prediction; thresholds quoted are
    // sourced from MANUAL_TREE_THRESHOLDS (fixed, human-chosen guideline values).
    const { tips, technicalBreakdown } = getStrategies(classificationResult.label, extractedFeatures,
        password, model.root, fullClassificationExplanation.classification_rationale, recommendationResult);

    // Decision tree trace - the FINAL label is 100% the real trained model's
    // prediction (classificationResult.label). The visual WALK through it is
    // now a manual, fixed 12-question checklist (buildManualDecisionPath)
    // instead of stopping wherever the trained tree itself stopped splitting.
    const actualModelDecisionPath = buildManualDecisionPath(extractedFeatures, classificationResult.label);

    // Kalkulahin ang estimated entropy bits para sa UI data visualization charts
    const entropyBits = Math.round(password.length * Math.log2(extractedFeatures.character_class_count * 22 || 26));
    console.log("PASSWORD:", password);
    console.log("RESULT:", classificationResult);

    // Ipasa ang bagong pinalawak na JSON body response
    res.json({
        password: password,
        vulnerability: classificationResult.label,
        decision_path: classificationResult.path,
        features: extractedFeatures,
        password_comparison: comparisonResult,

        // Decision tree trace. The final result at the leaf is 100% the real
        // trained model's prediction; the 12-question walk to get there is a
        // fixed, manual/rule-based checklist built from the same extracted
        // features, so the explanation is always complete rather than
        // stopping early wherever the trained tree itself stopped splitting.
        actual_model_decision_path: actualModelDecisionPath,

        analytics_breakdown: {
            password_length: extractedFeatures.length,
            character_classes_used: extractedFeatures.character_class_count,
            estimated_entropy_bits: entropyBits,
            dictionary_found: extractedFeatures.dictionary_present === 1 ? "Yes" : "No",
            rule_pattern_active: extractedFeatures.rule_pattern_present === 1 ? "Yes" : "No"
        },

        // Risk level predicted by the separate risk classifier, with a
        // transparent, itemized explanation of the contributing factors.
        risk_level: riskResult.level,
        risk_assessment: riskResult.explanation,

        // Primary fix predicted by the third, separate recommendation
        // classifier (recommendation_model.json) - exposed raw here so the
        // frontend/UI can show it directly if desired, in addition to the
        // plain-language "strategies" tips below which are built from it.
        recommendation_label: recommendationResult.label,

        // Full checklist of all 12 features (independent of the tree's actual depth)
        // plus a plain-language rationale for why this password landed in this class.
        classification_explanation: fullClassificationExplanation,

        security_assessment: technicalBreakdown,
        strategies: tips,
        dataset_count: trainingDataset.length
    });
});

app.listen(3000, () => {console.log('🚀 ML Backend running on http://localhost:3000');});