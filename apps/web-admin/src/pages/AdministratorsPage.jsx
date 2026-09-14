import { Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import { createAdministrator, getAdministrators, updateAdministratorStatus } from "../services/admin.api";

const initialForm = { email: "", name: "", password: "", phone: "", role: "ADMIN" };
const roleLabels = {
  ADMIN: "Administrador geral",
  COMPLIANCE: "Compliance",
  FINANCEIRO: "Financeiro",
  KYC: "Analista KYC",
  OPERACOES: "Operacoes",
  SUPER_ADMIN: "Super administrador",
  SUPORTE: "Suporte",
};

export function AdministratorsPage({ accessToken, currentAdminId }) {
  const [administrators, setAdministrators] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await getAdministrators(accessToken);
      setAdministrators(response.administrators);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar os administradores.");
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createAdministrator(accessToken, form);
      setForm(initialForm);
      await load();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel cadastrar o administrador.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(administrator, status) {
    setSaving(true);
    setError("");
    try {
      await updateAdministratorStatus(accessToken, administrator.id, status);
      await load();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel alterar este administrador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div><p className="eyebrow">Acesso interno</p><h1>Administradores</h1><p>Cadastre a equipe e limite cada acesso pelo papel administrativo.</p></div>
        <button className="button button--secondary" disabled={saving} onClick={load} type="button"><RefreshCw size={16} /> Atualizar</button>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <section className="admin-edit-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Novo acesso</p><h3>Cadastrar administrador</h3></div><Plus size={17} /></div>
        <form className="admin-edit-grid" onSubmit={submit}>
          <label>Nome<input maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} /></label>
          <label>E-mail<input maxLength={255} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required type="email" value={form.email} /></label>
          <label>Telefone opcional<input maxLength={30} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} value={form.phone} /></label>
          <label>Papel<select onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} value={form.role}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="admin-edit-grid__wide">Senha inicial<input autoComplete="new-password" minLength={12} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required type="password" value={form.password} /><small>Use pelo menos 12 caracteres.</small></label>
          <button className="button button--primary admin-edit-grid__wide" disabled={saving} type="submit"><ShieldCheck size={16} /> {saving ? "Cadastrando..." : "Cadastrar administrador"}</button>
        </form>
      </section>

      {administrators === null && !error ? <PageLoading label="Carregando administradores" /> : null}
      {administrators === null && error ? <PageError message={error} onRetry={load} /> : null}
      {administrators ? <section className="data-section data-section--flush">
        <div className="result-line"><strong>{administrators.length}</strong> administradores cadastrados</div>
        <div className="table-scroll"><table>
          <thead><tr><th>Administrador</th><th>Papel</th><th>Status</th><th>Ultimo acesso</th><th>Controle</th></tr></thead>
          <tbody>{administrators.map((administrator) => <tr key={administrator.id}>
            <td><div className="user-identity"><span className="avatar"><UserRound size={18} /></span><div><strong>{administrator.name}</strong><small>{administrator.email}{administrator.phone ? ` · ${administrator.phone}` : ""}</small></div></div></td>
            <td>{roleLabels[administrator.role] ?? administrator.role}</td>
            <td><StatusBadge status={administrator.status} /></td>
            <td>{administrator.lastLoginAt ? new Date(administrator.lastLoginAt).toLocaleString("pt-BR") : "Nunca acessou"}</td>
            <td><select disabled={saving || administrator.id === currentAdminId} onChange={(event) => changeStatus(administrator, event.target.value)} title={administrator.id === currentAdminId ? "Sua propria conta nao pode ser desativada" : "Alterar status"} value={administrator.status}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></td>
          </tr>)}</tbody>
        </table></div>
      </section> : null}
    </div>
  );
}
