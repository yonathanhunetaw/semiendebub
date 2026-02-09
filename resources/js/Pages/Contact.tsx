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

    // -------- CHAPTER 2 ---------------------------------------------------------------------
    // ------------------------------- JavaScript for React -----------------------------------
    // ----------------------------------------------------------------------------------------
                                                                          console.log('JavaScript for React');
    // ----------------------------------------------------------------------------------------
    // ------------------------------- Declaring Variables ------------------------------------
    // ----------------------------------------------------------------------------------------
                                                                                        console.log("Page 8");
    // ----------------------------------------------------------------------------------------
    // ---- The const Keyword ------------------------------------------------------------------
    // ----------------------------------------------------------------------------------------

    let injera;
    injera = false;
    console.log(injera); // false

    //Before constants, all we had were variables, and variables could be overwritten:
    var pizza2 = true;
    pizza2 = false;
    console.log(pizza2); // false

    // We cannot reset the value of a constant variable
    const pizza = true;
    // This would throw an "Uncaught TypeError"
    // pizza = false;


    // ----------------------------------------------------------------------------------------
    // ---- The let Keyword -------------------------------------------------------------------
    // ----------------------------------------------------------------------------------------
                                                                                        console.log("Page 9");

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

    // -----------------------------------------------------------------------------------------
    // ----- Template Strings ------------------------------------------------------------------
    // -----------------------------------------------------------------------------------------

    const lastName = 'Zewdie';
    const firstName = 'Yonathan';
    const middleName = 'Hunetaw';
    const fullName = `${firstName} ${middleName}
                       ${lastName}`;
    console.log(lastName+ ",",
               firstName,
               middleName);

    // ----------------------------------------------------------------------------------------
    // ------------------------------- Creating Function - ------------------------------------
    // ----------------------------------------------------------------------------------------
                                                                                       console.log("Page 12");
    // ----------------------------------------------------------------------------------------
    // ---- Function Declarations -----------------------------------------------------------
    // ----------------------------------------------------------------------------------------

    // I can call on this function as Function Declarations
    // can be hosted to the top but not Function Expressions.

    // Moves to the top. Can be called before it's written.
    // Syntax	Starts with the word function.
    logCompliment(); // Can call right away as it will be read on top
    function logCompliment() {
        console.log("Function Declarations -> You're doing great!");
    }
    logCompliment();  // here too obviously

    // ----------------------------------------------------------------------------------------
    // ------ Function Expressions ------------------------------------------------------------
    // ----------------------------------------------------------------------------------------

    // Function Expressions (Can not be called before
    // Expression) so cant call logCompliment2(); on top.
    // Stays where it is. Must be defined before it's called.
    // Syntax Starts with const, let, or var
    const logCompliment2 = function() {
        console.log("Function Expression -> You're doing great!");
    };
    logCompliment2();

    // What about in TypeScript?

    // TypeScript doesn't change how these functions run (the hoisting rules are the same),
    // but it changes how you define them.

    // it catches "Before definition" errors immediately without you having to run the code.

    //    Function Declaration in TS
    // You define the types of the parameters and the return value directly:

    //    TypeScript
    function logCompliment6(message: string): void {
        console.log(message);
    }
    logCompliment6('TypeScript hoophooopwe');

    //Function Expression in TS
    // This is more powerful because you can define the Type of the whole
    // function separately. This is very common in React (using React.FC or custom types):

    // TypeScript

    // void is a TypeScript-specific term. It means "this function returns nothing."
    // In Old JS, every function technically returns undefined if you don't use the return keyword.
    // type ComplimentBot = (name: string) => void;


    type ComplimentBot = (name: string) => void;

    // This line is just declaring that logCompliment7 is of type ComplimentBot!
    const logCompliment7: ComplimentBot = (name) => {
        console.log(`Doing great, ${name}!`);
    };

    logCompliment7('Tipitiping around TypeScript hoophooopwe');


    // -----------------------------------------------------------------------------------------
    // Passing arguments
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 13");
    // I declared argument as string :string for TypeScript

    const logCompliment3 =
        function(firstName: string, message :string) {
          console.log(`You're doing great,
          ${firstName}:
          ${message}`.replace(/\s+/g, ' '));
    };
    logCompliment3("Yonathan", "What's up");

    // ------------------------------------------------------------------------------------------
    // Function return
    // -------------------------------------------------------------------------------------------
                                                                                        console.log("Page 14");

    const createCompliment =
        function(firstName:string, message:string) {
            return `${firstName}: ${message}`;
    };
    createCompliment("Yonathan", "You're so cool");
    console.log(createCompliment("You're so cool",
                         "Yonathan"));

    // ----------------------------------------------------------------------------------------
    // ------  Default Parameters -------------------------------------------------------------
    // ----------------------------------------------------------------------------------------

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

    const me = {
        name: {
            first: "Yonathan",
            last: "Hunetaw"
        },
        favActivity: "coding"
    }

    logActivity5(me);

    // ----------------------------------------------------------------------------------------
    // ------  Arrow Functions ----------------------------------------------------------------
    // ----------------------------------------------------------------------------------------

    // New feature of ES6, With arrow functions, you can create
    // functions without using the function keyword.
    // You also often do not have to use the return keyword.

    // Old Function
    const glorify = function(firstName:string) {
        return `${firstName} of Canterbury`;
    };
    console.log(glorify("Dale")); // Dale of Canterbury
    console.log(glorify("Gail")); // Gail of Canterbury

    // With an Arrow Function we can simplify the syntax tremendously
    //@ts-ignore
    const glorifyArrow = (firstName) => `Yeabat sim - ${firstName}`;
    console.log(glorifyArrow("Yonathan"));

    // The same Arrow Function above would be like - (firstName : string) : string -
    // declares both the arguments type and return value
    const glorifyArrow2 = (firstName : string) : string => `Yeabat sim - ${firstName}`;

                                                                                     console.log("Page 15");
    // if the function only takes one argument,
    // we can remove the parentheses around the arguments. but not if its in TypeScript
    // @ts-ignore
    const glorify2 = firstName => `${firstName} of JavaScript -> ES6`;
    console.log(glorify2('Abebaw'));

    // Arrow Function with simplified syntax and TypeScript declaration
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

    // ------------------------------------------------------------------------------------------
    // Returning objects
    // ------------------------------------------------------------------------------------------
                                                                                       console.log("Page 16");
    // If an arrow function returns more that a string like an object we wrap it in parentheses
    // @ts-ignore

    const person = (firstName, lastName) => ({
       first: firstName,
       last: lastName
    });
    console.log(person("Flad", "Hanson"));

    // ------------------------------------------------------------------------------------------
    // Arrow Function and Scope
    // ------------------------------------------------------------------------------------------

    // Regular functions do not block this. For example, this becomes something else in
    // the setTimeout callback, not the tahoe object.
    // A regular function creates its own new environment. When setTimeout runs a regular function,
    // that function looks around, can’t see the tahoe object anymore, and defaults to the Window
    // (the global "nothingness"). It "blocks" the this from the outside from coming in.
    const tahoe = {
        mountains: ["Freel", "Rose", "Tallac", "Rubicon", "Silver"],
        print: function(delay = 1000) {
            setTimeout(function() {
                console.log(this.mountains.join(", "));
            }, delay);
        }
    };
    tahoe.print(); // Uncaught TypeError: Cannot read property 'join' of undefined

    console.log(this); // Window {}

    // Regular functions do not block this. For example, this becomes something else in
    // the setTimeout callback, not the tahoe object
    // This works as expected, and we can .join the resorts with a comma. Be careful that
    // you’re always keeping scope in mind. Arrow functions do not block off the scope of
    // this:
    //@ts-ignore
    const tahoe2 = {
        mountains: ["Freel", "Rose", "Tallac"],
        print: function(delay = 1000){
            setTimeout(() => {
                console.log(this.mountains.join(", "));
            }, delay);
        }
    };
    tahoe2.print();

    // Changing the print function to an arrow function means that this is actually the
    // window.
    const tahoe3 = {
        mountains: ["Freel", "Rose", "Tallac", "Rubicon", "Silver"],
        print: (delay = 1000) => {
            setTimeout(() => {
                console.log(this.mountains.join(", "));
            }, delay);
        }
    };
    tahoe3.print(); // Uncaught TypeError: Cannot read property 'join' of undefined

    // ------------------------------------------------------------------------------------------
    // ------------------------------- Compiling JavaScript -------------------------------------
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 17");
    // When a new JavaScript feature is proposed and gains support, the community often
    // wants to use it before it’s supported by all browsers. The only way to be sure that your
    // code will work is to convert it to more widely compatible code before running it in
    // the browser. This process is called compiling. One of the most popular tools for Java‐
    // Script compilation is Babel




    // ------------------------------------------------------------------------------------------
    // Objects and Arrays
    // ------------------------------------------------------------------------------------------

    // Since ES2016, JavaScript syntax has supported creative ways of scoping variables
    // within objects and arrays. These creative techniques are widely used among the React
    // community. Let’s take a look at a few of them, including destructuring, object literal
    // enhancement, and the spread operator.


    // ------------------------------------------------------------------------------------------
    // Destructuring Objects
    // ------------------------------------------------------------------------------------------
                                                                                       console.log("Page 18");
    const sandwich1 = {
        bread1: "dutch crunch",
        meat1: "tuna",
        cheese: "swiss",
        toppings: ["lettuce", "tomato", "mustard"]
    };
    // Make const variables bread and meat and assign there values from
    // object sandwich using the key names
    const { meat1, bread1 } = sandwich1;
    console.log(bread1, meat1); // dutch crunch tuna

    //Old way

    var sandwich2 = {
        bread2: "dutch crunch",
        meat2: "tuna",
        cheese: "swiss",
        toppings: ["lettuce", "tomato", "mustard"]
    };
    var bread2 = sandwich2.bread2,
        meat2 = sandwich2.meat2;

    // The code pulls bread and meat out of the object and creates local variables for them.
    // Also, since we declared these destructed variables using let, the bread and meat vari‐
    // ables can be changed without changing the original sandwich:

    const sandwich3 = {
        bread3: "dutch crunch",
        meat3: "tuna",
        cheese: "swiss",
        toppings: ["lettuce", "tomato", "mustard"]
    };
    let { bread3, meat3 } = sandwich3;
    bread3 = "garlic";
    meat3 = "turkey";
    console.log(bread3); // garlic
    console.log(meat3); // turkey
    console.log(sandwich3.bread3, sandwich3.meat3); // dutch crunch tuna

    // We can also destructure incoming function arguments. Consider this function that
    // would log a person’s name as a lord:
    //@ts-ignore
    const lordify = regularPerson3 => {
        console.log(`${regularPerson3.firstname} of Canterbury`);
    };
    const regularPerson3 = {
        firstname: "Bill",
        lastname: "Wilson"
    };
    lordify(regularPerson3); // Bill of Canterbury

    // Instead of using dot notation syntax to dig into objects, we can destructure the values
    // we need out of regularPerson:
    //@ts-ignore
    const lordify2 = ({ firstname }) => {
            console.log(`${firstname} of Canterbury`);
        };
    const regularPerson4 = {
        firstname: "Bill",
        lastname: "Wilson"
    };
    lordify2(regularPerson4); // Bill of Canterbury

    // Let’s take this one level farther to reflect a data change. Now, the regularPerson
    // object has a new nested object on the spouse key:
    const regularPerson5 = {
            firstname: "Bill",
            lastname: "Wilson",
            spouse: {
                firstname: "Phil",
                lastname: "Wilson"
        }
    };
    // If we wanted to lordify the spouse’s first name, we’d adjust the function’s destructured
    // arguments slightly:
    // @ts-ignore
    const lordify3 = ({ spouse: { firstname } }) => {
            console.log(`${firstname} of Canterbury`);
    };
    lordify(regularPerson5); // Phil of Canterbury

    // Using the colon and nested curly braces, we can destructure the firstname from the
    // spouse object.

    // ------------------------------------------------------------------------------------------
    // Destructuring Arrays
    // ------------------------------------------------------------------------------------------
                                                                                       console.log("Page 19");
    // Values can also be destructured from arrays. Imagine that we wanted to assign the
    // first value of an array to a variable name:
    const [firstAnimal] = ["Horse", "Mouse", "Cat"];
    console.log(firstAnimal); // Horse

    // We can also pass over unnecessary values with list matching using commas. List
    // matching occurs when commas take the place of elements that should be skipped.
    // With the same array, we can access the last value by replacing the first two values with commas:
    const [, , thirdAnimal] = ["Horse", "Mouse", "Cat"];
    console.log(thirdAnimal); // Cat

    // ------------------------------------------------------------------------------------------
    // Object Literal Enhancement
    // ------------------------------------------------------------------------------------------
                                                                                     console.log("Page 21");
    // Object literal enhancement is the opposite of destructuring. It’s the process of restruc‐
    // turing or putting the object back together. With object literal enhancement, we can
    // grab variables from the global scope and add them to an object:
    const name = "Tallac";
    const elevation = 9738;
    const funHike = { name, elevation };
    console.log(funHike); // {name: "Tallac", elevation: 9738}

    // We can also create object methods with object literal enhancement or restructuring:
    const name2 = "Tallac";
    const elevation2= 9738;
    const print = function() {
        //@ts-ignore
        console.log(`Mt. ${this.name2} is ${this.elevation2} feet tall`);
    };
    const funHike2 = { name2, elevation2, print };
    console.log(funHike2);
    // @ts-ignore
    funHike2.print(); // Mt. Tallac is 9738 feet tall

    // When defining object methods, it’s no longer necessary to use the function keyword:
    // Old
    var skier = {
        name: name,
        sound: 'aha',
        powderYell: function() {
            var yell = this.sound.toUpperCase();
            console.log(`${yell} ${yell} ${yell}!!!`);
        },
        //@ts-ignore
        speed: function(mph) {
            this.speed = mph;
            console.log("speed:", mph);
        }
    };
    skier.powderYell();
    skier.speed(45);
    // New
    const skier2 = {
        name,
        sound: 'aha',
        powderYell() {
            let yell = this.sound.toUpperCase();
            console.log(`${yell} ${yell} ${yell} skier2!!!`);
        },
        //@ts-ignore
        speed(mph) {
            this.speed = mph;
            console.log("speed:", mph);
        }
    };
    skier2.powderYell();
    skier2.speed(45);
    // Object literal enhancement allows us to pull global variables into objects and reduces
    // typing by making the function keyword unnecessary.

    // ------------------------------------------------------------------------------------------
    // The Spread Operator
    // ------------------------------------------------------------------------------------------



    // ------------------------------------------------------------------------------------------
    // ------------------------------- Asynchronous JavaScript ----------------------------------
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 23");


    // ------------------------------------------------------------------------------------------
    // Simple Promises with Fetch
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 24");


    // ------------------------------------------------------------------------------------------
    // Async/Await
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 25");


    // ------------------------------------------------------------------------------------------
    // Building Promises
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 26");


    // ------------------------------------------------------------------------------------------
    // Classes
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 27");





    // ------------------------------------------------------------------------------------------
    // -------------------------------------- ES6 Modules----------------------------------------
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 28");


    // ------------------------------------------------------------------------------------------
    // CommonJS
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 29");











    // -------- CHAPTER 3 -----------------------------------------------------------------------
    // -------------------------- Functional Programming with JavaScript ------------------------
    // ------------------------------------------------------------------------------------------
                                                                                        console.log("Page 32");




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
