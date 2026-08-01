// =====================================
// FEATURE VECTOR
// featureVector.js
// =====================================


// Prevent global variable conflicts
const FeatureVector = (() => {


    const API_URL =
    "http://localhost:3000/analyze";



    // =====================================
    // INITIALIZE FEATURE VECTOR
    // Called after component HTML loads
    // =====================================

    async function initializeFeatureVector(){


        console.log(
            "Feature Vector JS Connected"
        );



        try{


            const password =
            localStorage.getItem(
                "analyzedPassword"
            )
            ||
            "Password123";



            const response =
            await fetch(
                API_URL,
                {

                    method:"POST",

                    headers:{

                        "Content-Type":
                        "application/json"

                    },

                    body:JSON.stringify({

                        password:password

                    })

                }
            );



            const data =
            await response.json();



            console.log(
                "Feature Vector Response:",
                data
            );



            const features =
            data.features;



            if(!features){


                console.error(
                    "No feature vector data received"
                );


                return;


            }



            // =============================
            // BASIC FEATURES
            // =============================


            setValue(
                "fvLength",
                features.length
            );


            setValue(
                "fvLowercase",
                convert(features.has_lowercase)
            );


            setValue(
                "fvUppercase",
                convert(features.has_uppercase)
            );


            setValue(
                "fvDigits",
                convert(features.has_digit)
            );


            setValue(
                "fvSymbols",
                convert(features.has_symbol)
            );


            setValue(
                "fvClasses",
                features.character_class_count
            );





            // =============================
            // PATTERN FEATURES
            // =============================


            setValue(
                "fvDictionary",
                convert(features.dictionary_present)
            );


            setValue(
                "fvLeetspeak",
                convert(features.has_leetspeak)
            );


            setValue(
                "fvSuffix",
                convert(features.numeric_suffix)
            );


            setValue(
                "fvSequence",
                convert(features.has_sequence)
            );


            setValue(
                "fvRepetition",
                convert(features.has_repetition)
            );


            setValue(
                "fvRulePattern",
                convert(features.rule_pattern_present)
            );



        }


        catch(error){


            console.error(
                "Feature Vector Error:",
                error
            );


        }


    }




    // =====================================
    // SAFE ELEMENT UPDATE
    // =====================================

    function setValue(id,value){


        const element =
        document.getElementById(id);



        if(element){


            element.textContent =
            value;


        }


    }





    // =====================================
    // BOOLEAN FORMAT
    // =====================================

    function convert(value){


        return value === 1
        ? "Present"
        : "Not Present";


    }





    // expose function
    return {

        initializeFeatureVector

    };


})();




// =====================================
// GLOBAL ACCESS FOR RESULT.JS
// =====================================

window.initializeFeatureVector =
FeatureVector.initializeFeatureVector;