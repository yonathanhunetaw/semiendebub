import React from 'react';

// This is the magic part! 
// It tells the computer exactly what this button needs to work.
interface MyButtonProps {
    text: string;           // Must be a string
    onClick: () => void;    // Must be a function that returns nothing
    type?: 'button' | 'submit'; // The "?" means it's optional
    disabled?: boolean;     // Also optional
}

const MyButton = ({ text, onClick, type = 'button', disabled = false }: MyButtonProps) => {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
            {text}
        </button>
    );
};

export default MyButton;