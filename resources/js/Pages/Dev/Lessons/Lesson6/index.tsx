import AdminLayout from "@/Layouts/AppLayout";
import {Head} from "@inertiajs/react";
import React, {useState} from "react";
import StarRating from "@/Pages/Dev/Lessons/Lesson6/StarRating";

import Box from '@mui/material/Box';

interface Lesson6Props {
    initialColors: {
        id: string;
        title: string;
        color: string;
        rating: number;
    }[];
}

// @ts-ignore
export default function Index({initialColors}: Lesson6Props) {
    console.log("Page 97");
    console.log("------------------------------ CHAPTER 6 -------------------------------");
    console.log("---------------------------- React State Management ---------------------------");

    const separator = "------------------------------------------------------------------------------";

    interface Color {
        id: string;
        title: string;
        color: string;
        rating: number;
    }

    interface props {
        initialColors: Color[];
    }

    const [colors, setColors] = useState<Color[]>(initialColors);

    return (
        <>
            <Head title="Lesson 6"/>


            <h1 className="font-bold text-center text-1xl">
                Lesson 6
            </h1>
            {/* Wrap the call in braces */}
            {/*In JSX, anything written inside the return parentheses is treated as literal text or a
               component unless it is wrapped in curly braces {}.*/}

            {<div>{separator}</div>}
            <h1 className="font-bold">Building a Star Rating Component</h1>{/*Building a Star Rating Component Page */}
            {<div>{separator}</div>}
            <StarRating/>
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">The useState Hook</h1>      {/*The useState Hook*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Refactoring for Advanced
                Reusability</h1>  {/*Refactoring for Advanced Reusability*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">State in Component Trees</h1>         {/*State in Component Trees*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Sending State Down a Component
                Tree</h1>         {/*Sending State Down a Component Tree*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Sending Interactions Back up a Component
                Tree</h1> {/*Sending Interactions Back up a Component Tree*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Building Forms</h1>      {/*Building Forms*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Using Refs</h1>      {/*Using Refs*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Controlled Components</h1>      {/*Controlled Components*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Creating Custom Hooks</h1>      {/*Creating Custom Hooks*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Adding Colors to State</h1>      {/*Adding Colors to State*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">React Context</h1>      {/*React Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Placing Colors in Context</h1>      {/*Placing Colors in Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Retrieving Colors with
                useContext</h1>      {/*Retrieving Colors with useContext*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Placing Colors in Context</h1>      {/*Placing Colors in Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            <h1 className="font-bold text-1xl">Custom Hooks with Context</h1>      {/*Custom Hooks with Context*/}
            {<div>{separator}</div>}
            {<div>{separator}</div>}
            {/*</Color>*/}

            <Box component="section" sx={{ p: 2, border: '1px dashed grey' }}>
                This Box renders as an HTML section element.
            </Box>
        </>
    )
}


// The version you have (at the bottom of the file) is called a Persistent Layout.
// The version I gave you is a Standard Wrapper.
Index.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
