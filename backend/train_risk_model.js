const fs = require("fs");
const csv = require("csv-parser");
const { DecisionTreeClassifier } = require("ml-cart");

const X = [];
const y = [];

// Index Mapping
const labelMap = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MODERATE": 2
};

const datasetFile = "risk_dataset.csv";

fs.createReadStream(datasetFile)
    .pipe(csv())
    .on("data", (row) => {
        if (!row.risk_label) return;

        const cleanedLabel = row.risk_label.trim();
        if (labelMap[cleanedLabel] === undefined) return;

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
        const classifier = new DecisionTreeClassifier({
            gainFunction: "gini",
            maxDepth: 10,
            minNumSamples: 2
        });

        classifier.train(X, y);

        fs.writeFileSync("risk_model.json", JSON.stringify(classifier.toJSON()));
        console.log("🚀 Risk model re-trained successfully!");
    });