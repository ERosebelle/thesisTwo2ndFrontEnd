const fs = require("fs");
const csv = require("csv-parser");
const { DecisionTreeClassifier } = require("ml-cart");

const X = [];
const y = [];

const labelMap = {
    "AVOID_DICTIONARY_WORDS": 0,
    "AVOID_PREDICTABLE_PATTERNS": 1,
    "ADD_CHARACTER_VARIETY": 2,
    "INCREASE_LENGTH": 3
};

const datasetFile = "recommendation_dataset.csv";

fs.createReadStream(datasetFile)
    .pipe(csv())
    .on("data", (row) => {
        if (!row.recommendation_label) return;

        const cleanedLabel = row.recommendation_label.trim();
        if (labelMap[cleanedLabel] === undefined) return;

        // ALIGNED TO 14 FEATURES
        X.push([
            Number(row.f_length),
            Number(row.f_char_class_count),
            Number(row.f_has_lowercase),
            Number(row.f_has_uppercase),
            Number(row.f_has_digit),
            Number(row.f_has_symbol),
            Number(row.f_dictionary_present),
            Number(row.f_has_leetspeak),
            Number(row.f_numeric_prefix),
            Number(row.f_numeric_suffix),
            Number(row.f_numeric_infix),
            Number(row.f_has_sequence),
            Number(row.f_has_repetition),
            Number(row.f_rule_pattern_present)
        ]);

        y.push(labelMap[cleanedLabel]);
    })
    .on("end", () => {
        if (X.length === 0 || y.length === 0) {
            console.error(`❌ Error: No valid rows found in ${datasetFile}. Run create_recommendation_dataset.js first.`);
            return;
        }

        console.log(`✅ Recommendation training samples loaded: ${X.length}`);

        const classifier = new DecisionTreeClassifier({
            gainFunction: "gini",
            maxDepth: 10,
            minNumSamples: 3
        });

        classifier.train(X, y);

        fs.writeFileSync(
            "recommendation_model.json",
            JSON.stringify(classifier.toJSON())
        );

        console.log("🚀 Recommendation model trained successfully and saved to recommendation_model.json!");
    });