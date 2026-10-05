import {JSXElementConstructor, ReactElement, ReactNode, ReactPortal, useState} from "react";
import AdminLayout from "@/Layouts/AdminLayout";

// @ts-ignore
function Home2({name}) {
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

            <div className="mt-6 p-4 bg-surface-container-lowest shadow rounded-lg">
                <p className="text-lg">Your dice roll: <strong>{num}</strong></p>
                <button
                    onClick={handleClick}
                    className="mt-2 px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary/90"
                >
                    Click to get a new number
                </button>
            </div>
        </>
    );
}

// Persistent Layout assignment
Home2.layout = (page: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined) => (
    <AdminLayout children={page} />
);

export default Home2;
