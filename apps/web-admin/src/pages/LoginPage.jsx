import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Brand } from "../components/Brand";
import { loginAdmin } from "../services/auth.api";

export function LoginPage({ onAuthenticated }) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      onAuthenticated(await loginAdmin({ login: formData.get("login"), password: formData.get("password") }));
    } catch (requestError) {
      setError(requestError.status === 401 ? "E-mail ou senha inválidos." : "Não foi possível conectar à API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Brand />
        <div className="auth-intro__copy"><p className="eyebrow">Central de operação</p><h1>Decisões claras para uma operação em movimento.</h1><p>Gestão diária da base, da rede e da operação comercial DeTudoJá.</p></div>
        <small><ShieldCheck size={15} /> Acesso exclusivo para administradores autorizados</small>
      </section>
      <section className="auth-panel" aria-labelledby="login-title">
        <header className="auth-panel__header"><span className="auth-panel__badge"><ShieldCheck size={15} /> Área protegida</span><h2 id="login-title">Entrar no painel</h2><p>Use suas credenciais administrativas.</p></header>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>E-mail<span className="input-with-icon"><Mail size={18} /><input autoComplete="username" name="login" placeholder="admin@detudoja.local" required type="email" /></span></label>
          <label>Senha<span className="input-with-icon"><LockKeyhole size={18} /><input autoComplete="current-password" name="password" required type={showPassword ? "text" : "password"} /><button aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword((visible) => !visible)} title={showPassword ? "Ocultar senha" : "Mostrar senha"} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button--primary button--wide" disabled={isSubmitting} type="submit">{isSubmitting ? "Entrando..." : <>Entrar <ArrowRight size={17} /></>}</button>
        </form>
      </section>
    </main>
  );
}
