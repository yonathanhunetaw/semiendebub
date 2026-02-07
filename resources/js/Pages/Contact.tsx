// resources/js/Pages/Contact.tsx
import AdminLayout from "@/Components/Admin/AdminLayout"; // Adjust path if needed
import { Head } from "@inertiajs/react";
import { Typography } from "@mui/material";

export default function Contact() {

    // --------------------------------------------------------
    // ZONE A: PURE JAVASCRIPT
    // Logic, math, variables, console.logs live here.
    // --------------------------------------------------------

    // --- Logic starts here ---
    // JavaScript now has lexical variable scope.
    // In JavaScript, we create code blocks with
    // curly braces ({}). In functions, these curly braces
    // block off the scope of any variable declared with var.
    // But if a variable is created inside of an if/else block,
    // that variable is not scoped to the block.


    // Learning React -> Modern Patterns for Developing React Apps.

    // CHAPTER 2
    // JavaScript for React
    console.log('JavaScript for React');
    // ----------------------------------------------------------------------------------------
    console.log("Page 8");
    // The const Keyword
    // ----------------------------------------------------------------------------------------

    let injera;
    injera = false;
    console.log(injera); // false

    // We cannot reset the value of a constant variable
    const pizza = true;
    // This would throw an "Uncaught TypeError"
    // pizza = false;

    // ----------------------------------------------------------------------------------------
    console.log("Page 9");
    // The let Keyword
    // ----------------------------------------------------------------------------------------

    var topicBlock = "JavaScript";
    if (topicBlock) {
        topicBlock = "React"; // Because of 'var', this overwrites the one above
        console.log("block", topicBlock);
    }

    console.log("global", topicBlock);

    // With the let keyword, we can scope a variable to
    // any code block. Using let protects the value of
    // the global variable:

    var topic = "JavaScript";
    if (topic) {
        let topic = "React";
        console.log("block", topic); // React
    }

    console.log("global", topic); // JavaScript

    const boxes = [0, 1, 2, 3, 4];

    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    // Template Strings
    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    const lastName = 'Zewdie';
    const firstName = 'Yonathan';
    const middleName = 'Hunetaw';
    const fullName = `${firstName} ${middleName}
                       ${lastName}`;
    console.log(lastName+ ",",
               firstName,
               middleName);

    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 12");
    // Function Declarations
    // I can call on this function as Function Declarations
    // can be hosted to the top but not Function Expressions.
    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    logCompliment();
    function logCompliment() {
        console.log("Function Declarations -> You're doing great!");
    }

    // Function Expressions (Can not be called before
    // Expression) so cant call logCompliment2(); on top.
    const logCompliment2 = function() {
        console.log("Function Expression -> You're doing great!");
    };
    logCompliment2();

    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 13");
    // Passing arguments
    // I declared argument as string :string for TypeScript
    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    const logCompliment3 =
        function(firstName: string, message :string) {
          console.log(`You're doing great,
          ${firstName}:
          ${message}`.replace(/\s+/g, ' '));
    };
    logCompliment3("Yonathan", "What's up");

    // ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 14");
    // Function return
    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    const createCompliment =
        function(firstName:string, message:string) {
            return `${firstName}: ${message}`;
    };
    createCompliment("Yonathan", "You're so cool");
    console.log(createCompliment("You're so cool",
                         "Yonathan"));

    // Default Parameters
    function logActivity4(name = "Shane McConkey", activity = "skiing") {
        console.log(`${name} loves ${activity}`);
    }

    logActivity4(); // Uses Defaults

    // Default arguments can be any type, not just strings:
    const defaultPerson = {
        name: {
            first: "Shane",
            last: "McConkey"
        },
        favActivity: "skiing"
    };

    function logActivity5(person = defaultPerson) {
        console.log(`${person.name.first} loves ${person.favActivity}`);
    }

    logActivity5();

    // Arrow Functions
    // New feature of ES6, With arrow functions, you can create
    // functions without using the function keyword.
    // You also often do not have to use the return keyword.


    // Old Function
    const glorify = function(firstName:string) {
        return `${firstName} of Canterbury`;
    };
    console.log(glorify("Dale")); // Dale of Canterbury
    console.log(glorify("Gail")); // Gail of Canterbury

    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 15");
    // Arrow Function with simplified syntax
    // if the function only takes one argument,
    // we can remove the parentheses around the arguments.
    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    // @ts-ignore

    const glorify2 = firstName => `${firstName}
    of JavaScript -> ES6`;
    console.log(glorify2('Abebaw'));

    // Arrow Function with simplified syntax any TypeScript declaration
    const glorify3 = (firstName: string): string =>
        `${firstName} of TypeScript`;
    console.log(glorify3('Abebaw'));

    // More than one argument should be surrounded by parentheses:
    // Typical function
    // @ts-ignore

    const glorify4 = function(firstName, land) {
        return `${firstName} of ${land}`;
    };

    // Arrow Function
    // @ts-ignore

    const glorify5 = (firstName, land) =>
        `${firstName} of ${land}`;
    console.log(glorify5("Don", "Piscataway")); // Don of Piscataway
    console.log(glorify5("Todd", "Schenectady")); // Todd of Schenectady

    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 16");
    // Returning objects
    // If an arrow function returns more that a string like an object we wrap it
    // in parentheses
    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    // @ts-ignore

    const person = (firstName, lastName) => ({
       first: firstName,
       last: lastName
    });
    console.log(person("Flad", "Hanson"));

    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    console.log("Page 18");
    // Destructuring Objects
    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    const sandwich = {
        bread: "dutch crunch",
        meat: "tuna",
        cheese: "swiss",
        toppings: ["lettuce", "tomato", "mustard"]
    };
    // Make const variables bread and meat and assign there values from
    // object sandwich using the key names
    const { meat, bread } = sandwich;
    console.log(bread, meat); // dutch crunch tuna




    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    return (
        // ----------------------------------------------------
        // ZONE B: JSX (The UI Blueprint)
        // This looks like HTML, but you can jump back
        // to Zone A using { name }.
        // ----------------------------------------------------
        <> {/* This is a Fragment; it groups elements without
               adding extra nodes to the DOM */}
            <div>
                <Typography variant="h6">var or let</Typography>

                <div id="container">
                    {boxes.map((i) => (
                        <div
                            key={i}
                            onClick={() => alert("This is box #" + i)}
                            style={{ border: '1px solid black', padding: '10px', margin: '5px', cursor: 'pointer' }}
                        >
                            Box {i} (Click me!)
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <Typography variant="h6">{fullName}</Typography>
            </div>
        </>
    );
}

Contact.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Contact Us" />
        {page}
    </AdminLayout>
);
