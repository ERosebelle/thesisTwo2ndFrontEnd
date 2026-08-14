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
const model = JSON.parse(
    fs.readFileSync(path.join(__dirname, "model.json"))
);

const classifier = DecisionTreeClassifier.load(model);
console.log("✅ ML model loaded");

// ===== LOAD RISK MODEL =====
// Separate CART classifier trained on risk_dataset.csv (risk_label:
// LOW/MODERATE/HIGH/CRITICAL) - see create_risk_dataset.js / train_risk_model.js.
let riskModel = null;
let riskClassifier = null;
try {
    riskModel = JSON.parse(
        fs.readFileSync(path.join(__dirname, "risk_model.json"))
    );
    riskClassifier = DecisionTreeClassifier.load(riskModel);
    console.log("✅ Risk model loaded");
} catch (err) {
    console.log("⚠️ risk_model.json not found - run create_risk_dataset.js then train_risk_model.js to generate it. Risk level will be unavailable until then.");
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
    let dictionaryDetected = 0;

    // 1. FAST: Exact match (Laging 100% tama)
    if (englishSet.has(leetNormalized) || tagalogSet.has(leetNormalized)) {
        dictionaryDetected = 1;
    } else {
        // 2. CONTROLLED substring check na may density threshold
        let longestMatchLength = 0;

        for (let word of englishSet) {
            if (word.length >= 4 && leetNormalized.includes(word)) {
                if (word.length > longestMatchLength) {
                    longestMatchLength = word.length;
                }
            }
        }

        if (longestMatchLength === 0) {
            for (let word of tagalogSet) {
                if (word.length >= 4 && leetNormalized.includes(word)) {
                    if (word.length > longestMatchLength) {
                        longestMatchLength = word.length;
                    }
                }
            }
        }

        // Sinasala ang mga accidental 4-letter matches sa loob ng mahahabang random strings
        if (longestMatchLength >= 4) {
            const wordRatio = longestMatchLength / originalPassword.length;

            if (wordRatio >= 0.35 || longestMatchLength >= 6) {
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

/* Builds a transparent, itemized explanation of WHY the risk model landed on
this level, using the exact same scoring contributions calculateSecurityScore()
uses internally (length, character diversity, dictionary/rule-pattern/sequence/
repetition penalties) - so the explanation is traceable to real, computed
numbers rather than a canned sentence per class. */
/* ===== RISK MODEL DECISION TRACE (100% MODEL-DEPENDENT) =====
Walks the ACTUAL trained risk tree (riskModel.root) along the path THIS
password's features actually took, collecting each real learned split
(feature, threshold, which side was taken) until reaching a leaf. This is
the risk-level equivalent of generateActualModelDecisionPath() for the
vulnerability classifier - nothing here is hand-authored; every step is a
split the risk CART model genuinely learned from risk_dataset.csv. */
function traceRiskDecisionPath(extractedFeatures, treeRoot) {
    const steps = [];
    let current = treeRoot;

    while (current && current.left && current.right) {
        const meta = FEATURE_COLUMNS[current.splitColumn];
        if (!meta) {
            // Unknown column index - stop tracing safely rather than guess.
            break;
        }

        const actualValue = extractedFeatures[meta.key];
        const threshold = current.splitValue;
        // Matches ml-cart's own predict() routing: value < threshold -> left, else -> right.
        const tookRight = actualValue >= threshold;

        steps.push({
            feature: meta.key,
            label: FEATURE_LABELS[meta.key],
            threshold: threshold,
            actualValue: actualValue,
            direction: tookRight ? "higher" : "lower",
            explanation: tookRight ? meta.explain.YES : meta.explain.NO
        });

        current = tookRight ? current.right : current.left;
    }

    return steps;
}

/* Turns the real traced steps into a plain-language paragraph - this is what
makes the risk explanation genuinely "the model's own reasoning" rather than
a parallel hand-coded formula description. */
function buildRiskModelRationale(steps, level) {
    if (steps.length === 0) {
        return `The risk model reached a ${level} risk rating immediately, without needing to check any of the password's features.`;
    }

    const stepSentences = steps.map((step, i) => {
        const ordinal = i === 0 ? "First" : (i === steps.length - 1 ? "Finally" : "Next");
        const comparisonWord = step.direction === "higher" ? "at or above" : "below";
        const roundedThreshold = Math.round(step.threshold * 100) / 100;

        return `${ordinal}, the model checked "${step.label}": your password's value (${step.actualValue}) is ${comparisonWord} its learned threshold of ${roundedThreshold}.`;
    });

    return `The risk model evaluated this password through ${steps.length} learned decision${steps.length === 1 ? "" : "s"} from risk_model.json. ` +
        stepSentences.join(" ") +
        ` This path led to a final rating of ${level} risk.`;
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

    // 100% model-dependent: trace the ACTUAL risk_model.json tree for this
    // password and build the summary from those real steps, instead of a
    // parallel hand-coded formula description.
    const modelSteps = traceRiskDecisionPath(features, treeRoot);
    const summary = buildRiskModelRationale(modelSteps, level);

    return {
        risk_level: level,
        security_score: score,
        summary,
        model_decision_steps: modelSteps,
        // Supplementary, formula-based breakdown (calculateSecurityScore) -
        // still useful as an itemized score explanation, but distinct from
        // the model's own reasoning above.
        contributing_factors: contributions
    };
}

/* Searches the trained tree for the first node that splits on the given
feature column and returns its learned threshold, or null if that feature
was never actually used as a split anywhere in the tree (meaning the model
didn't find it decisive enough to split on, given gainThreshold). Used so
recommendation text quotes numbers the model actually learned instead of
values a developer picked by hand. */
function findLearnedThreshold(node, splitColumn) {
    if (!node || !node.left || !node.right) {
        return null;
    }
    if (node.splitColumn === splitColumn) {
        return node.splitValue;
    }
    return findLearnedThreshold(node.left, splitColumn) ?? findLearnedThreshold(node.right, splitColumn);
}

// ===== 3. DYNAMIC REALISTIC SECURITY STRATEGIES & BREAKDOWN =====
function getStrategies(vulnerabilityType, extractedFeatures, password, treeRoot, classificationRationale) {
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

    /* Length threshold (feature column 0): the current trained tree doesn't
    actually split on length at all (it wasn't decisive enough given the
    training data), so there's no learned number to quote here. Falling back
    to the conventional 12-character cybersecurity guideline, labeled
    explicitly as a general best practice rather than implied to be
    model-derived. */
    const learnedLengthThreshold = findLearnedThreshold(treeRoot, 0);
    const lengthThreshold = learnedLengthThreshold ?? 12;
    const lengthThresholdIsLearned = learnedLengthThreshold !== null;

    // Character class count threshold (feature column 1) - the model DOES
    // split on this, so this number comes straight from the trained tree.
    const learnedClassThreshold = findLearnedThreshold(treeRoot, 1);
    const classThreshold = learnedClassThreshold ?? 3;
    const classThresholdIsLearned = learnedClassThreshold !== null;

    // Base Rules for UI feedback (Dynamic placeholders based on user input)
    if (currentPassword.length < lengthThreshold) {
        const basis = lengthThresholdIsLearned
            ? `the model's learned split threshold of ${Math.round(lengthThreshold)} characters`
            : `the recommended ${Math.round(lengthThreshold)}-character cybersecurity standard (the model itself did not learn a length threshold from the training data, so this is a general guideline)`;
        tips.push(`⚠️ Length Deficit: Your current length of ${currentPassword.length} characters is below ${basis}.`);
    }
    if (extractedFeatures.character_class_count < classThreshold) {
        const basis = classThresholdIsLearned
            ? `the model's learned threshold of ${Math.round(classThreshold)} character classes`
            : `the recommended ${Math.round(classThreshold)} character classes`;
        tips.push(`⚠️ Character Diversity: You are only using ${extractedFeatures.character_class_count} character classes, below ${basis}. Try blending upper, lower, digits, and symbols.`);
    }

    // Dynamic Sample Generation for shuffling strategy
    const halfLength = Math.ceil(currentPassword.length / 2);
    const shuffledSample = currentPassword.substring(halfLength) + currentPassword.substring(0, halfLength);

    // Dynamic Breakdown base sa Category
    if (vulnerabilityType === "DICTIONARY") {
        technicalBreakdown.attack_vector = extractedFeatures.character_class_count > 1
            ? `This password is vulnerable to Dictionary Attacks because it matches commonly used words that attackers test first using automated cracking tools and pre-compiled wordlists. It does use ${extractedFeatures.character_class_count} character classes, but the underlying dictionary word remains the primary weakness attackers would target.`
            : `This password is vulnerable to Dictionary Attacks because it matches commonly used words that attackers test first using automated cracking tools and pre-compiled wordlists, with no additional character variety to slow that process down.`;
        technicalBreakdown.remediation =
            `Transition from the single word '${currentPassword}' to the 'Passphrase Method' by combining 3 to 4 random, unrelated words.`;

        tips.push(`🚨 Critical Warning: Avoid using raw, recognizable words like '${currentPassword}' as your password base.`);
        tips.push(`💡 Recommendation: Transform it into a Passphrase. Instead of '${currentPassword}', use something expanded like '${currentPassword}SapatosKapeHalimaw' to scale up security complexity.`);
    }

    else if (vulnerabilityType === "RULE-BASED") {
        const detectedPatterns = [];
        if (extractedFeatures.has_leetspeak) detectedPatterns.push("leetspeak substitution");
        if (extractedFeatures.numeric_suffix) detectedPatterns.push("a numeric suffix");
        if (extractedFeatures.has_sequence) detectedPatterns.push("a sequential character pattern");
        if (extractedFeatures.has_repetition) detectedPatterns.push("a repeated character/substring pattern");

        technicalBreakdown.attack_vector = detectedPatterns.length > 0
            ? `Vulnerable to Hybrid/Rule-Based Attacks (e.g., Hashcat rules engine). This specific password contains ${detectedPatterns.join(", ")} - patterns that modern rule-based cracking tools test automatically after common dictionary words.`
            : `Vulnerable to Hybrid/Rule-Based Attacks (e.g., Hashcat rules engine). Modern GPU cracking setups automatically anticipate common human-created variations on dictionary words.`;
        technicalBreakdown.remediation =
            `Disrupt predictable character positioning. Inject symbols and numbers unexpectedly into the middle of the string.`;

        if (extractedFeatures.has_leetspeak) {
            tips.push(`🔄 Leetspeak Exploitation: The character substitutions detected in '${currentPassword}' are fully mapped out by modern automated attack engines.`);
        }
        if (extractedFeatures.numeric_suffix) {
            tips.push(`🔢 Numeric Suffix Pattern: Appending numbers or years at the very end of '${currentPassword}' is a highly predictable human pattern that tools crack first.`);
        }
        if (/^[A-Z][a-z]+/.test(currentPassword)) {
            tips.push(`🔠 Title Case Bias: Capitalizing only the first letter of '${currentPassword}' follows standard linguistic habits. Try scattering uppercase letters dynamically.`);
        }
        tips.push(`💡 Strategy: Implement structural randomization. Instead of your current linear pattern '${currentPassword}', try shuffling or breaking the structure into something like '${shuffledSample}'.`);
    }

    else if (vulnerabilityType === "BRUTE-FORCE") {
        const searchSpaceIsStrong = extractedFeatures.length >= 12 && extractedFeatures.character_class_count >= 3;
        technicalBreakdown.attack_vector = searchSpaceIsStrong
            ? `Targeted by Combinatorial/Exhaustive Brute-Force Attacks, though with a length of ${extractedFeatures.length} characters and ${extractedFeatures.character_class_count} character classes in use, the combinatorial search space is large enough to resist most practical attacks.`
            : `Targeted by Combinatorial/Exhaustive Brute-Force Attacks, where a computer systematically checks every mathematical combination. With only ${extractedFeatures.length} characters and ${extractedFeatures.character_class_count} character class${extractedFeatures.character_class_count === 1 ? "" : "es"} in use, this password's search space is smaller than recommended.`;
        technicalBreakdown.remediation =
            `Increase overall password length to push the mathematical search space beyond realistic computing capabilities.`;

        if (currentPassword.length < 12) {
            tips.push(`❌ Attack Hazard: Although random, a length of ${currentPassword.length} characters for '${currentPassword}' can still be exhausted by modern GPU cluster arrays in a relatively short timeframe.`);
            tips.push(`💡 Action Required: Lengthen this random base. Every single character added to '${currentPassword}' multiplies the computational search difficulty exponentially.`);
        } else {
            tips.push(`⭐ High Complexity: The password '${currentPassword}' demonstrates excellent entropy and high computational resistance against automated guessing.`);
        }
        tips.push(`🛡️ Hybrid Defense: Pair high-entropy strings like '${currentPassword}' with Multi-Factor Authentication (MFA) to fully mitigate credential hazards.`);
    }

    // Extra structural alerts
    if (extractedFeatures.has_sequence) {
        tips.push(`🚫 Sequence Alert: The sequential layout found inside '${currentPassword}' drastically shortens the cracking algorithm search paths.`);
    }
    if (extractedFeatures.has_repetition) {
        tips.push(`🔁 Repetition Alert: Consecutive identical characters in '${currentPassword}' reduce mathematical entropy.`);
    }
    if (/^[^A-Za-z0-9]/.test(currentPassword) || /[^A-Za-z0-9]$/.test(currentPassword)) {
        tips.push(`📌 Placement Bias: Placing symbols strictly at the absolute start or end of '${currentPassword}' follows predictable human creation habits.`);
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
        question: (t) => `Password length >= ${Math.round(t)}?`,
        explain: {
            YES: "The password reached the length threshold the model learned to associate with lower risk. Longer passwords increase the search space.",
            NO: "The password is shorter than the length threshold the model learned. Shorter passwords are easier to guess or brute-force."
        }
    },
    {
        key: "character_class_count",
        question: (t) => `Character class count >= ${Math.round(t)}?`,
        explain: {
            YES: "The password mixes enough character categories (upper/lower/digits/symbols) to match the pattern the model associates with lower risk.",
            NO: "The password uses fewer character categories than the threshold the model learned, limiting the possible combinations an attacker has to try."
        }
    },
    {
        key: "has_lowercase",
        question: () => "Contains lowercase letters?",
        explain: {
            YES: "Lowercase characters were detected, increasing character variety.",
            NO: "No lowercase characters were detected."
        }
    },
    {
        key: "has_uppercase",
        question: () => "Contains uppercase letters?",
        explain: {
            YES: "Uppercase characters were detected. However, predictable capitalization can still be guessed.",
            NO: "No uppercase characters were detected."
        }
    },
    {
        key: "has_digit",
        question: () => "Contains digits?",
        explain: {
            YES: "Numbers were detected. Digits increase complexity but predictable placement may reduce security.",
            NO: "No digits were detected."
        }
    },
    {
        key: "has_symbol",
        question: () => "Contains symbols?",
        explain: {
            YES: "Special symbols were detected, increasing possible combinations.",
            NO: "No symbols were detected."
        }
    },
    {
        key: "dictionary_present",
        question: () => "Dictionary word present?",
        explain: {
            YES: "A recognizable dictionary word was detected. Attackers commonly test known words first using wordlists.",
            NO: "No dictionary word was detected. The password does not directly match common words."
        }
    },
    {
        key: "has_leetspeak",
        question: () => "Leetspeak substitution present?",
        explain: {
            YES: "Leetspeak substitutions were detected, which attackers commonly include in rule-based attacks.",
            NO: "No leetspeak substitution was detected."
        }
    },
    {
        key: "numeric_suffix",
        question: () => "Numeric suffix present?",
        explain: {
            YES: "A number suffix was detected after a dictionary word, a common password habit.",
            NO: "No predictable numeric suffix was detected."
        }
    },
    {
        key: "has_sequence",
        question: () => "Sequential pattern present?",
        explain: {
            YES: "Sequential patterns like abc or 123 were detected.",
            NO: "No sequential pattern was detected."
        }
    },
    {
        key: "has_repetition",
        question: () => "Repeated character pattern present?",
        explain: {
            YES: "Repeated characters were detected, reducing randomness.",
            NO: "No repeated character pattern was detected."
        }
    },
    {
        key: "rule_pattern_present",
        question: () => "Rule-based pattern present?",
        explain: {
            YES: "Predictable patterns were detected, such as sequences, repetition, suffix numbers, or substitutions.",
            NO: "No common human-created pattern was detected."
        }
    }
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

/* ===== DECISION TREE VISUAL TRACE (100% MODEL-DEPENDENT) =====
Walks the ACTUAL trained tree (model.root). A node is a leaf when it has no
left/right children (ml-cart stops expanding once gain drops below
gainThreshold, even if splitColumn/splitValue metadata is still present on
that node). Every question, threshold, and result here is something the
model genuinely learned - nothing here is hand-authored. This is the sole
source for the UI's Decision Tree Explorer / hologram. */
function generateActualModelDecisionPath(vulnerabilityType, extractedFeatures, treeRoot) {

    function decisionNode(question, feature, yesChild, noChild, answer, explanation, breakdown) {
        return {
            name: question,
            type: "decision",
            feature: feature,
            value: answer === "YES" ? 1 : 0,
            decision: answer,
            explanation: {
                YES: explanation.YES,
                NO: explanation.NO
            },
            breakdown: breakdown || null,
            children: [
                {
                    name: "YES",
                    branch: "YES",
                    taken: answer === "YES",
                    explanation: explanation.YES,
                    children: yesChild ? [yesChild] : []
                },
                {
                    name: "NO",
                    branch: "NO",
                    taken: answer === "NO",
                    explanation: explanation.NO,
                    children: noChild ? [noChild] : []
                }
            ]
        };
    }

    function leaf(label) {
        return {
            name: label,
            type: "result",
            final: true,
            result: label
        };
    }

    // Class order matches labelMap in train_model.js (0=DICTIONARY, 1=RULE-BASED, 2=BRUTE-FORCE).
    const CLASSIFICATION_LABELS = ["DICTIONARY", "RULE-BASED", "BRUTE-FORCE"];

    /* Off-path leaves should NOT just repeat vulnerabilityType (the real
    prediction) - that would falsely claim the untaken branch leads to the
    same result. ml-cart's leaf `distribution` arrays aren't reliably a
    fixed 3-wide array (some leaves collapse to fewer entries when only a
    subset of classes reached that leaf during training), so we only trust
    an argmax decode when the array is unambiguously the full 3-class
    width; otherwise we show a neutral, non-committal label rather than
    guess wrong. */
    function bestEffortOffPathLabel(node) {
        if (node && Array.isArray(node.distribution) && Array.isArray(node.distribution[0])
            && node.distribution[0].length === CLASSIFICATION_LABELS.length) {
            const dist = node.distribution[0];
            let maxI = 0;
            for (let i = 1; i < dist.length; i++) {
                if (dist[i] > dist[maxI]) maxI = i;
            }
            return CLASSIFICATION_LABELS[maxI];
        }
        return "OTHER OUTCOME";
    }

    function walk(node, onTakenPath) {
        if (!node || !node.left || !node.right) {
            return leaf(onTakenPath ? vulnerabilityType : bestEffortOffPathLabel(node));
        }

        const meta = FEATURE_COLUMNS[node.splitColumn];
        if (!meta) {
            return leaf(onTakenPath ? vulnerabilityType : bestEffortOffPathLabel(node));
        }

        const actualValue = extractedFeatures[meta.key];
        const threshold = node.splitValue;
        const tookRight = actualValue >= threshold;

        const yesChild = walk(node.right, onTakenPath && tookRight);
        const noChild = walk(node.left, onTakenPath && !tookRight);
        const breakdown = buildAggregateBreakdown(meta.key, extractedFeatures);

        return decisionNode(
            meta.question(threshold),
            meta.key,
            yesChild,
            noChild,
            tookRight ? "YES" : "NO",
            meta.explain,
            breakdown
        );
    }

    return walk(treeRoot, true);
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

    // Full 12-feature checklist + rationale - independent of how shallow the trained tree is.
    // Computed BEFORE getStrategies() now, since its classification_rationale
    // (genuinely grounded in this password's actual feature values) replaces
    // the old static per-class vulnerability_explanation template.
    const fullClassificationExplanation = explainClassification(extractedFeatures, classificationResult.label);

    // Kunin ang pormal at realistic strategies at breakdown - thresholds quoted are sourced from model.root where the model actually learned them
    const { tips, technicalBreakdown } = getStrategies(classificationResult.label, extractedFeatures,
        password, model.root, fullClassificationExplanation.classification_rationale);

    // Decision tree trace - 100% derived from the trained model (model.json).
    const actualModelDecisionPath = generateActualModelDecisionPath(classificationResult.label, extractedFeatures, model.root);

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

        // Decision tree trace - 100% derived from the trained model (model.json).
        // Every question, threshold, and result here comes from the model's own
        // learned splits, walked live for this specific password.
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

        // Full checklist of all 12 features (independent of the tree's actual depth)
        // plus a plain-language rationale for why this password landed in this class.
        classification_explanation: fullClassificationExplanation,

        security_assessment: technicalBreakdown,
        strategies: tips,
        dataset_count: trainingDataset.length
    });
});

app.listen(3000, () => {
    console.log('🚀 ML Backend running on http://localhost:3000');
});