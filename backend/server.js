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
        has_repetition: /(.)\1{2,}/.test(originalPassword) ? 1 : 0,
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

// ===== 3. DYNAMIC REALISTIC SECURITY STRATEGIES & BREAKDOWN =====
function getStrategies(vulnerabilityType, extractedFeatures, password) {
    let tips = [];
    let technicalBreakdown = {
        vulnerability_explanation: "",
        attack_vector: "",
        remediation: ""
    };

    const currentPassword = password;

    // Base Rules for UI feedback (Dynamic placeholders based on user input)
    if (currentPassword.length < 12) {
        tips.push(`⚠️ Length Deficit: Your current length of ${currentPassword.length} characters is below the recommended 12-character cybersecurity standard.`);
    }
    if (extractedFeatures.character_class_count < 3) {
        tips.push(`⚠️ Character Diversity: You are only using ${extractedFeatures.character_class_count} character classes. Try blending upper, lower, digits, and symbols.`);
    }

    // Dynamic Sample Generation for shuffling strategy
    const halfLength = Math.ceil(currentPassword.length / 2);
    const shuffledSample = currentPassword.substring(halfLength) + currentPassword.substring(0, halfLength);

    // Dynamic Breakdown base sa Category
    if (vulnerabilityType === "DICTIONARY") {
        technicalBreakdown.vulnerability_explanation =
            `The password '${currentPassword}' consists entirely of a standard dictionary word found in the database without sufficient complexity additions.`;
        technicalBreakdown.attack_vector =
            `This password is vulnerable to Dictionary Attacks because it matches commonly used words that attackers test first using automated cracking tools and pre-compiled wordlists.`;
        technicalBreakdown.remediation =
            `Transition from the single word '${currentPassword}' to the 'Passphrase Method' by combining 3 to 4 random, unrelated words.`;

        tips.push(`🚨 Critical Warning: Avoid using raw, recognizable words like '${currentPassword}' as your password base.`);
        tips.push(`💡 Recommendation: Transform it into a Passphrase. Instead of '${currentPassword}', use something expanded like '${currentPassword}SapatosKapeHalimaw' to scale up security complexity.`);
    }

    else if (vulnerabilityType === "RULE-BASED") {
        technicalBreakdown.vulnerability_explanation =
            `The password '${currentPassword}' relies on a dictionary word foundation but attempts obfuscation using common, predictable human-created rules.`;
        technicalBreakdown.attack_vector =
            `Vulnerable to Hybrid/Rule-Based Attacks (e.g., Hashcat rules engine). Modern GPU cracking setups automatically anticipate variations applied to '${currentPassword}' like trailing digits or leetspeak substitutions.`;
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
        technicalBreakdown.vulnerability_explanation =
            `The password '${currentPassword}' shows no reliance on dictionary strings or traditional human habits. Security depends strictly on its combinatorial character space.`;
        technicalBreakdown.attack_vector =
            `Targeted by Combinatorial/Exhaustive Brute-Force Attacks, where a computer systematically checks every mathematical combination until it hits '${currentPassword}'.`;
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

/* ===== 4. DYNAMIC DECISION TREE VISUAL TRACE PATH =====
This now builds a full, two-sided binary tree (every question always has a YES child AND a NO child) instead of a single chain that only contained
whichever branch was actually taken. Each decision node also carries an explicit `decision: "YES" | "NO"` field, and every child node carries a
`taken: true | false` flag. That's the piece the frontend needs in order to know which side of the tree to actually walk/highlight, instead of
guessing (previously it always walked children[0]).*/
function generateVisualTreePath(vulnerabilityType, extractedFeatures, password) {

    /*
        Creates a TRUE binary decision tree.
        Every decision node has:
        - YES branch
        - NO branch

        Frontend will later decide:
        - show both branches
        - animate only the taken path
    */
    function decisionNode(question, feature, yesChild, noChild, answer, explanation) {

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

    /* FEATURE SHORTHANDS
    Pull out the already-computed extractedFeatures values we want to visually explain. This does NOT change what
    classifyPassword() predicted - it only decides which side of each visual question is "taken" (matches the real value).*/
    const isDictionary = extractedFeatures.dictionary_present === 1;
    const isLongEnough = extractedFeatures.length >= 8;
    const hasSymbol = extractedFeatures.has_symbol === 1;
    const hasDigit = extractedFeatures.has_digit === 1;
    const hasUpper = extractedFeatures.has_uppercase === 1;
    const hasLower = extractedFeatures.has_lowercase === 1;
    const diverseClasses = extractedFeatures.character_class_count >= 3;
    const isLeet = extractedFeatures.has_leetspeak === 1;
    const isSuffix = extractedFeatures.numeric_suffix === 1;
    const isSequence = extractedFeatures.has_sequence === 1;
    const isRepeat = extractedFeatures.has_repetition === 1;
    const hasRulePattern = extractedFeatures.rule_pattern_present === 1;

    // Derived, visualization-only signals - not used by classifyPassword(), just extra "why" checks for the tree.
    const highEntropy = extractedFeatures.length >= 12 && extractedFeatures.character_class_count >= 3;
    const commonStructure = isDictionary && hasUpper && !hasSymbol && !hasDigit;


    /*CHAIN BUILDER
    Wraps `continueNode` with one more visual question. Whichever side matches `isYes` becomes the
    "taken" side and leads tocontinueNode; the other side is a short, plausible dead-end leaf
    (never actually walked by the real traversal, since `isYes` always reflects the real extracted feature value).*/
    function wrap(question, feature, isYes, continueNode, offPathLabel) {
        const explanations = {
            "dictionary_present": {
                YES: "A recognizable dictionary word was detected. Attackers commonly test known words first using wordlists.",
                NO: "No dictionary word was detected. The password does not directly match common words."
            },

            "length": {
                YES: "The password reached the minimum length requirement. Longer passwords increase the search space.",
                NO: "The password is shorter than the recommended length, making guessing attempts easier."
            },

            "has_lowercase": {
                YES: "Lowercase characters were detected, increasing character variety.",
                NO: "No lowercase characters were detected."
            },

            "has_uppercase": {
                YES: "Uppercase characters were detected. However, predictable capitalization can still be guessed.",
                NO: "No uppercase characters were detected."
            },

            "has_digit": {
                YES: "Numbers were detected. Digits increase complexity but predictable placement may reduce security.",
                NO: "No digits were detected."
            },

            "has_symbol": {
                YES: "Special symbols were detected, increasing possible combinations.",
                NO: "No symbols were detected."
            },

            "character_class_count": {
                YES: "The password uses multiple character categories.",
                NO: "The password uses limited character categories."
            },

            "entropy": {
                YES: "The password has higher estimated entropy because of length and character diversity.",
                NO: "The password has lower entropy and fewer possible combinations."
            },

            "rule_pattern_present": {
                YES: "Predictable patterns were detected, such as sequences, repetition, suffix numbers, or substitutions.",
                NO: "No common human-created pattern was detected."
            },

            "has_sequence": {
                YES: "Sequential patterns like abc or 123 were detected.",
                NO: "No sequential pattern was detected."
            },

            "has_repetition": {
                YES: "Repeated characters were detected, reducing randomness.",
                NO: "No repeated character pattern was detected."
            },

            "has_leetspeak": {
                YES: "Leetspeak substitutions were detected, which attackers commonly include in rule-based attacks.",
                NO: "No leetspeak substitution was detected."
            },

            "numeric_suffix": {
                YES: "A number suffix was detected after a dictionary word, a common password habit.",
                NO: "No predictable numeric suffix was detected."
            },

            "common_structure": {
                YES: "The password follows a common capitalization structure.",
                NO: "The password does not follow the common capitalization pattern."
            }
        };

        return decisionNode(
            question,
            feature,
            isYes ? continueNode : leaf(offPathLabel),
            isYes ? leaf(offPathLabel) : continueNode,
            isYes ? "YES" : "NO",
            explanations[feature] || {
                YES: "This feature exists in the password.",
                NO: "This feature does not exist in the password."
            }
        );
    }

    /*DICTIONARY BRANCH -Chain runs bottom-up: the first wrap() call sits deepest
    (closest to the final leaf), the last wrap() call becomes the root.
    The real predicted label is always reached at the very end of the "taken" path.*/

    if (isDictionary) {
        let node = leaf(vulnerabilityType);
        node = wrap("Numeric suffix?", "numeric_suffix", isSuffix, node, "DICTIONARY");
        node = wrap("Has leetspeak?", "has_leetspeak", isLeet, node, "DICTIONARY");
        node = wrap("Rule pattern present?", "rule_pattern_present", hasRulePattern, node, "DICTIONARY");
        node = wrap("Common structure (capitalized word)?", "common_structure", commonStructure, node, "DICTIONARY");
        node = wrap("Character class count >= 3?", "character_class_count", diverseClasses, node, "DICTIONARY");
        node = wrap("Contains symbols?", "has_symbol", hasSymbol, node, "DICTIONARY");
        node = wrap("Contains digits?", "has_digit", hasDigit, node, "DICTIONARY");
        node = wrap("Contains uppercase?", "has_uppercase", hasUpper, node, "DICTIONARY");
        node = wrap("Password length >= 8?", "length", isLongEnough, node, "DICTIONARY");
        node = wrap("Dictionary present?", "dictionary_present", true, node, "BRUTE-FORCE");
        return node;
    }

    // NON-DICTIONARY BRANCH
    let node = leaf(vulnerabilityType);
    node = wrap("Has repetition?", "has_repetition", isRepeat, node, "BRUTE-FORCE");
    node = wrap("Has sequence?", "has_sequence", isSequence, node, "BRUTE-FORCE");
    node = wrap("Rule pattern present?", "rule_pattern_present", hasRulePattern, node, "BRUTE-FORCE");
    node = wrap("High entropy?", "entropy", highEntropy, node, "BRUTE-FORCE");
    node = wrap("Character class count >= 3?", "character_class_count", diverseClasses, node, "BRUTE-FORCE");
    node = wrap("Contains symbols?", "has_symbol", hasSymbol, node, "BRUTE-FORCE");
    node = wrap("Contains digits?", "has_digit", hasDigit, node, "BRUTE-FORCE");
    node = wrap("Contains uppercase?", "has_uppercase", hasUpper, node, "BRUTE-FORCE");
    node = wrap("Contains lowercase?", "has_lowercase", hasLower, node, "BRUTE-FORCE");
    node = wrap("Password length >= 8?", "length", isLongEnough, node, "BRUTE-FORCE");
    node = wrap("Dictionary present?", "dictionary_present", false, node, "DICTIONARY");
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

        /*Literal duplicate input (e.g. "1" then "1" again) gets its
        own clear message instead of the generic "similar" wording,
        which is reserved for two *different* passwords that just
        happen to score the same.*/
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

    // Kunin ang pormal at realistic strategies at breakdown
    const { tips, technicalBreakdown } = getStrategies(classificationResult.label, extractedFeatures,
        password);

    // I-generate ang tinukoy mong Tree Structure Base sa Input Properties
    const decisionTreeVisual = generateVisualTreePath(classificationResult.label, extractedFeatures, password);

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

        // Iwanan lang natin ang live dynamic trace block
        visual_decision_tree_trace: decisionTreeVisual,

        analytics_breakdown: {
            password_length: extractedFeatures.length,
            character_classes_used: extractedFeatures.character_class_count,
            estimated_entropy_bits: entropyBits,
            dictionary_found: extractedFeatures.dictionary_present === 1 ? "Yes" : "No",
            rule_pattern_active: extractedFeatures.rule_pattern_present === 1 ? "Yes" : "No"
        },

        security_assessment: technicalBreakdown,
        strategies: tips,
        dataset_count: trainingDataset.length
    });
});

app.listen(3000, () => {
    console.log('🚀 ML Backend running on http://localhost:3000');
});