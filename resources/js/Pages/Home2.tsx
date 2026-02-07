import { useState } from "react";
import AdminLayout from "../Layouts/AdminLayout";

function Home2({ name }) {
    // Dice logic moved inside Home2
    const getRandomNumber = () => {
        return Math.ceil(Math.random() * 6);
    };

    const [num, setNum] = useState(getRandomNumber());

    const handleClick = () => {
        setNum(getRandomNumber());
    };

    return (
        <>
            <h1 className="title">Home - Hello {name}</h1>
            
            <div className="mt-6 p-4 bg-white shadow rounded-lg">
                <p className="text-lg">Your dice roll: <strong>{num}</strong></p>
                <button 
                    onClick={handleClick}
                    className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Click to get a new number
                </button>
            </div>
        </>
    );
}

// Persistent Layout assignment
Home2.layout = (page) => (
    <AdminLayout 
        header={<h2 className="font-semibold text-xl">Dashboard</h2>} 
        children={page} 
    />
);

export default Home2;