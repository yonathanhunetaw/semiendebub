import React, {useState} from 'react';
import {FaStar} from "react-icons/fa";

const Star = ({selected = false, onSelect = f => f}) => (
    <FaStar color={selected ? 'red' : 'gray'} onClick={onSelect}/>
);
const createArray = (length: number) => [...Array(length)];
const separator = "------------------------------------------------------------------------------";
export default function StarRating({totalStars = 5}) {
    const [selectedStars, setSelectedStars] = useState(0);
    return (
        <div style={{display: 'flex', alignItems: 'center'}}>
            {createArray(totalStars).map((n, i) => (
                <Star key={i}
                      selected={selectedStars > i}
                      onSelect={() => setSelectedStars(i + 1)}/>
            ))}
            <p style={{marginLeft: '10px'}}>
                {selectedStars} of {totalStars} stars
            </p>
        </div>
    );
}
