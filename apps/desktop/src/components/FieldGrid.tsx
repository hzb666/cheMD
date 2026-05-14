interface FieldGridProps {
  fields: Array<[string, string]>;
  wideLabels?: boolean;
}

export const FieldGrid: React.FC<FieldGridProps> = ({ fields, wideLabels }) => (
  <dl
    className={`grid gap-x-4 gap-y-1 text-xs ${
      wideLabels ? "grid-cols-[10rem_1fr]" : "grid-cols-[7rem_1fr]"
    }`}
  >
    {fields.map(([key, value]) => (
      <div key={key} className="contents">
        <dt className="font-medium text-muted-foreground truncate">{key}</dt>
        <dd className="truncate">{value}</dd>
      </div>
    ))}
  </dl>
);

export default FieldGrid;
