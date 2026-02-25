import {FaStar} from "react-icons/fa";
import React, {CSSProperties} from 'react';

interface StarProps {
    selected?: boolean;
    onSelect: () => void;
}

const Star = ({selected = false, onSelect}: StarProps) => (
    <FaStar
        color={selected ? 'red' : 'gray'}
        onClick={onSelect}
        style={{cursor: 'pointer'}}
    />
);

const createArray = (length: number) => [...Array(length)];

interface StarRatingProps {
    totalStars?: number;
    style?: CSSProperties;
    // These two are what Color.tsx is trying to pass!
    selectedStars?: number;
    onRate?: (rating: number) => void;
}

export default function StarRating({
                                       totalStars = 5,
                                       style = {},
                                       selectedStars = 0, // Default if nothing is passed
                                       onRate = f => f    // Default empty function
                                   }: StarRatingProps) {

    // Logic: If selectedStars is passed from a parent (Color), use that.
    // Otherwise, use the internal state.
    return (
        <div style={{display: 'flex', alignItems: 'center', ...style}}>
            {createArray(totalStars).map((_, i) => (
                <Star
                    key={i}
                    selected={selectedStars > i}
                    onSelect={() => onRate(i + 1)}
                />
            ))}
            <p style={{marginLeft: '10px'}}>
                {selectedStars} of {totalStars} stars
            </p>
        </div>
    );
}
