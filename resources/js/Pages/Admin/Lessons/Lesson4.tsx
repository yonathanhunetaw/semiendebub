import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head} from "@inertiajs/react";
import React from "react";

export default function Lesson4(): any {
    console.log("Page 57");
    console.log("------------------------------ CHAPTER 4 -------------------------------");
    console.log("---------------------------- How React Works ---------------------------");

    console.log("--- This is the structure of a React element ----------------------------");
    console.log("const myElement = React.createElement(\"h1\", {id: \"recipe-0\"}, \"Baked Salmon\");");
    console.log("console.log(myElement);");

    let id;
    const myElement = React.createElement("h1", {id: "recipe-0"}, "Baked Salmon");
    const myElementWithChildren = React.createElement(
        "ul",
        null,
        React.createElement("li", null, "2 lb salmon"),
        React.createElement("li", null, "5 sprigs fresh rosemary"),
        React.createElement("li", null, "2 tablespoons olive oil"),
        React.createElement("li", null, "2 small lemons"),
        React.createElement("li", null, "1 teaspoon kosher salt"),
        React.createElement("li", null, "4 cloves of chopped garlic")
    );
    const items = ["2 lb salmon",
        "5 springs fresh rosemary",
        "2 tablespoons olive oil",
        "2 small lemons",
        "1 teaspoon kosher salt",
        "4 cloves of chopped garlic"
    ];
    const mappedItems = React.createElement("ul", {className: "ingredients"},
        items.map(ingredient => React.createElement("li", null, ingredient))
    );

    const mappedItemsWithKey = React.createElement("ul", {className: "ingredients"},
        items.map((ingredient, i) => React.createElement("li", {key: i}, ingredient))
    );
    const separator = "------------------------------------------------------------------------------";

    console.log(myElementWithChildren);
    console.log(myElement); // Logs the object
    return (
        <>
            <Head title="Lesson 4"/>

            <h1 className="text-5xl font-bold text-center">
                Lesson 4
            </h1>
            {/* Wrap the call in braces */}
            {/*In JSX, anything written inside the return parentheses is treated as literal text or a
               component unless it is wrapped in curly braces {}.*/}

            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">How react works</h1> {/*How react works*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Page Setup</h1>      {/*Page Setup*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">React Elements</h1>  {/*React Elements*/}
            {<div>{separator}</div>}
            {myElement}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">ReactDOM</h1>         {/*ReactDOM*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Children</h1>         {/*Children*/}
            {<div>{separator}</div>}
            {myElementWithChildren}
            {<div>{separator}</div>}
            {mappedItems}
            {<div>{separator}</div>}
            {mappedItemsWithKey}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">React Components</h1> {/*React Components*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}


        </>
    )
}
Lesson4.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
