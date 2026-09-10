export function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <span>B</span>
        <i>✓</i>
      </span>
      {!compact ? (
        <span className="brand__name">
          Brasil <span>Cashback</span>
        </span>
      ) : null}
    </div>
  );
}
