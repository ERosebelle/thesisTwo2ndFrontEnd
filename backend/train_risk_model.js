/* TRAIN RISK MODEL
Same CART training approach as train_model.js, but targeting risk_label
(LOW/MODERATE/HIGH/CRITICAL) instead of vulnerability type. This is a
SEPARATE classifier from model.json - server.js loads both and runs a
password through each independently. */
const fs = require("fs");
const csv = require("csv-parser");
const { DecisionTreeClassifier } = require("ml-cart");

const X = [];
const y = [];

const labelMap = {
    "MODERATE": 0,
    "HIGH": 1,
    "CRITICAL": 2
};

const datasetFile = "risk_dataset.csv";

fs.createReadStream(datasetFile)
    .pipe(csv())
    .on("data", (row) => {
        if (!row.risk_label) {
            return;
        }

        const cleanedLabel = row.risk_label.trim();
        if (labelMap[cleanedLabel] === undefined) {
            return;
        }

        // SAME 12-FEATURE ORDER AS model.json, so both classifiers can share
        // the exact same modelFeatures array in server.js.
        X.push([
            Number(row.f_length),
            Number(row.f_char_class_count),
            Number(row.f_has_lowercase),
            Number(row.f_has_uppercase),
            Number(row.f_has_digit),
            Number(row.f_has_symbol),
            Number(row.f_dictionary_present),
            Number(row.f_has_leetspeak),
            Number(row.f_numeric_suffix),
            Number(row.f_has_sequence),
            Number(row.f_has_repetition),
            Number(row.f_rule_pattern_present)
        ]);

        y.push(labelMap[cleanedLabel]);
    })
    .on("end", () => {
        if (X.length === 0 || y.length === 0) {
            console.error(`❌ Error: No valid rows found in ${datasetFile}. Run create_risk_dataset.js first.`);
            return;
        }

        console.log(`✅ Risk training samples loaded: ${X.length}`);
        console.log("Numeric labels sample:", y.slice(0, 10));

        const classifier = new DecisionTreeClassifier({
            gainFunction: "gini",
            maxDepth: 10,
            minNumSamples: 3
        });

        classifier.train(X, y);

        fs.writeFileSync(
            "risk_model.json",
            JSON.stringify(classifier.toJSON())
        );

        console.log("🚀 Risk model trained successfully and saved to risk_model.json!");
    });