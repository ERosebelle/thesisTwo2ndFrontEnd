const fs = require("fs");
const csv = require("csv-parser");
const { DecisionTreeClassifier } = require("ml-cart");

const X = [];
const y = [];

// Map string labels to numeric targets
const labelMap = {
  "DICTIONARY": 0,
  "RULE-BASED": 1,
  "BRUTE-FORCE": 2
};

// Target dataset file
const datasetFile = "dataset.csv";

fs.createReadStream(datasetFile)
  .pipe(csv())
  .on("data", (row) => {

    if (!row.label) {
      return;
    }

    const cleanedLabel = row.label.trim();

    if (labelMap[cleanedLabel] === undefined) {
      return;
    }

    // 🌟 FULL 12 FEATURES ARRAY MATCHING THE NEW CSV STRUCTURE
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
      console.error(`❌ Error: Walang valid na data na nakuha mula sa ${datasetFile}!`);
      return;
    }

    console.log(`✅ Training samples successfully loaded: ${X.length}`);
    console.log("Numeric labels sample:", y.slice(0, 10));

    // Train CART Decision Tree Model
    const classifier = new DecisionTreeClassifier({
      gainFunction: "gini",
      maxDepth: 10,
      minNumSamples: 3
    });

    classifier.train(X, y);

    // Save exported model configuration to model.json
    fs.writeFileSync(
      "model.json",
      JSON.stringify(classifier.toJSON())
    );

    console.log("🚀 Model trained successfully with all 12 features saved to model.json!");
  });