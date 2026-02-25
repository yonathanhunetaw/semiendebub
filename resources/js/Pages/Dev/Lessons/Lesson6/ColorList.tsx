// resources/js/Pages/Admin/Lessons/Lesson6/Color.tsx
import React from "react";
import StarRating from "./StarRating";
import {FaTrash} from "react-icons/fa";

// This interface is the "Source of Truth" for what a Color is
export interface ColorProps {
    id: string;
    title: string;
    color: string;
    rating: number;
    onRemove: (id: string) => void;
    onRate: (id: string, rating: number) => void;
}

export default function Color({
                                  id,
                                  title,
                                  color,
                                  rating,
                                  onRemove,
                                  onRate
                              }: ColorProps) {
    return (
        <section className="border rounded-lg shadow-sm bg-white overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b">
                <h1 className="font-bold capitalize">{title}</h1>
                <button
                    onClick={() => onRemove(id)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded"
                >
                    <FaTrash/>
                </button>
            </div>
            <div style={{height: 100, backgroundColor: color}}/>
            <div className="p-3">
                <StarRating
                    selectedStars={rating}
                    onRate={newRating => onRate(id, newRating)}
                />
            </div>
        </section>
    );
}
