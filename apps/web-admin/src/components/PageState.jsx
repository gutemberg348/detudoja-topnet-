import { AlertCircle, LoaderCircle } from "lucide-react";

export function PageLoading({ label = "Carregando dados" }) {
  return (
    <div className="page-state" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

export function PageError({ message, onRetry }) {
  return (
    <div className="page-state page-state--error" role="alert">
      <AlertCircle size={22} />
      <span>{message}</span>
      {onRetry ? (
        <button className="button button--secondary" onClick={onRetry} type="button">
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
