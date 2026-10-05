export default function Checkbox({ className = '', ...props }) {
    return (
        <input
            {...props}
            type="checkbox"
            className={
                'rounded border-outline bg-surface-container-lowest text-primary shadow-sm focus:ring-primary ' +
                className
            }
        />
    );
}
