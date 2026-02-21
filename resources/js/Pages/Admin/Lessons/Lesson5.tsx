import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head} from "@inertiajs/react";
import React from "react";

export default function Lesson5(): any {
    console.log("Page 97");
    console.log("------------------------------ CHAPTER 5 -------------------------------");
    console.log("---------------------------- React State Management ---------------------------");

    const separator = "------------------------------------------------------------------------------";

    return (
        <>
            <Head title="Lesson 5"/>

            <h1 className="text-5xl font-bold text-center">
                Lesson 5
            </h1>
            {/* Wrap the call in braces */}
            {/*In JSX, anything written inside the return parentheses is treated as literal text or a
               component unless it is wrapped in curly braces {}.*/}

            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Building a Star Rating
                Component</h1> {/*Building a Star Rating Component*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">The useState Hook</h1>      {/*The useState Hook*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Refactoring for Advanced
                Reusability</h1>  {/*Refactoring for Advanced Reusability*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">State in Component Trees</h1>         {/*State in Component Trees*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Sending State Down a Component
                Tree</h1>         {/*Sending State Down a Component Tree*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Sending Interactions Back up a Component
                Tree</h1> {/*Sending Interactions Back up a Component Tree*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Building Forms</h1>      {/*Building Forms*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Using Refs</h1>      {/*Using Refs*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Controlled Components</h1>      {/*Controlled Components*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Creating Custom Hooks</h1>      {/*Creating Custom Hooks*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Adding Colors to State</h1>      {/*Adding Colors to State*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">React Context</h1>      {/*React Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Placing Colors in Context</h1>      {/*Placing Colors in Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Retrieving Colors with
                useContext</h1>      {/*Retrieving Colors with useContext*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Placing Colors in Context</h1>      {/*Placing Colors in Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="text-5xl font-bold">Custom Hooks with Context</h1>      {/*Custom Hooks with Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
        </>
    )
}
Lesson5.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
