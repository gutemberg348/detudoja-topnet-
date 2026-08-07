export function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <span>d</span>
        <i>✓</i>
      </span>
      {!compact ? (
        <span className="brand__name">
          DeTudo<span>Já</span>
        </span>
      ) : null}
    </div>
  );
}
