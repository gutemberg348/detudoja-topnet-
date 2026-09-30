import { useState } from "react";
import { Archive, ArrowRight, Ban, Check, Clock3, Gift, Layers3, ReceiptText, RefreshCw, RotateCcw, Store, Users, WalletCards } from "lucide-react";
import { actionAvailability, CloseButton, dateTime, label, money, PaymentDialog, personName, StatusBadge } from "./paymentPresentation";

export const actionIcons = { pay: Check, cancel: Ban, refund: RotateCcw, archive: Archive };
const tabs = [["overview", "Visão geral"], ["distribution", "Ganhos e beneficiários"], ["ledger", "Movimentações"], ["history", "Histórico"]];
const sum = (rows) => rows.reduce((total, item) => total + Number(item.amountCents), 0);

function Empty({ children }) { return <div className="pay-empty-inline"><ReceiptText size={24} /><p>{children}</p></div>; }
function Fact({ title, children }) { return <div className="pay-fact"><span>{title}</span>{children}</div>; }
function AmountRow({ title, value, hint }) { return <div className="pay-amount-row"><span>{title}{hint && <small>{hint}</small>}</span><strong>{money(value)}</strong></div>; }

function Distribution({ details }) {
  const settlement = details.settlement;
  if (!settlement) return <Empty>{details.deposit ? "Depósitos creditam a carteira indicada na visão geral e não geram distribuição de ganhos de venda." : "Ainda não há distribuição registrada. Em pedidos de loja, os ganhos são calculados quando a compra é concluída."}</Empty>;
  const rewards = settlement.rewards ?? [];
  const groups = [
    { title: "Cashback", icon: Gift, rows: rewards.filter((item) => ["CASHBACK_COMPRADOR", "CASHBACK"].includes(item.type)) },
    { title: "Indicações", icon: Users, rows: rewards.filter((item) => ["BONUS_INDICACAO_CONSUMIDOR", "BONUS_INDICACAO", "BONUS_VENDEDOR"].includes(item.type)) },
    { title: "Rede", icon: Layers3, rows: rewards.filter((item) => item.type === "BONUS_REDE") },
  ];
  const recipients = [
    ...(settlement.receivables ?? []).map((item) => ({ ...item, key: `receivable-${item.id}`, amountCents: item.netCents, date: item.paidAt || item.availableAt, dateLabel: item.paidAt ? "Pago em" : "Liberação prevista", description: item.blockReason })),
    ...rewards.map((item) => ({ ...item, key: `reward-${item.id}`, date: item.reversedAt || item.releasedAt, dateLabel: item.reversedAt ? "Estornado em" : "Liberado em" })),
  ];
  return <>
    <div className="pay-section-heading"><div><h3>Como o valor foi distribuído</h3><p>Transação #{settlement.id} · {dateTime(settlement.validatedAt)}</p></div><StatusBadge status={settlement.status} /></div>
    <div className="pay-distribution-grid">
      <article className="pay-breakdown"><h4><Store size={18} /> Venda e taxas</h4>
        <AmountRow title="Valor bruto" value={settlement.grossCents} />
        <AmountRow title="Líquido da loja / vendedor" value={settlement.sellerNetCents} />
        <AmountRow title="Taxa da plataforma" value={settlement.platformFeeCents} hint={settlement.feePercent ? `${settlement.feePercent}% sobre ${money(settlement.commissionBaseCents)}` : undefined} />
        <AmountRow title="Processamento" value={settlement.processingFeeCents} />
        <AmountRow title="Entrega da loja" value={settlement.deliveryCents} hint="Parcela informada na composição da venda" />
      </article>
      <article className="pay-breakdown pay-breakdown--pool"><h4><Layers3 size={18} /> Pool e empresa</h4>
        <AmountRow title="Pool de recompensas" value={settlement.rewardsPoolCents} />
        <AmountRow title="Cashback prioritário" value={settlement.cashbackCents} />
        <AmountRow title="Receita da empresa" value={settlement.companyCents} />
        <p>O pool reúne as recompensas da venda. Os beneficiários abaixo detalham esses valores; não são cobranças adicionais. O cashback total pode incluir uma parcela prioritária além do pool.</p>
      </article>
    </div>
    <div className="pay-reward-totals">{groups.map(({ title, icon: Icon, rows }) => <article key={title}><Icon size={19} /><span>{title}</span><strong>{money(sum(rows))}</strong><small>{rows.length} beneficiário(s)</small></article>)}</div>
    <div className="pay-section-heading"><div><h3>Quem recebeu e quanto</h3><p>Valores registrados, com a situação individual de cada recebimento.</p></div><span className="pay-count">{recipients.length}</span></div>
    {recipients.length ? <div className="pay-table-wrap"><table className="pay-detail-table"><thead><tr><th>Beneficiário</th><th>Origem do ganho</th><th>Valor</th><th>Situação / liberação</th></tr></thead><tbody>{recipients.map((item) => <tr key={item.key}>
      <td><strong>{personName(item.recipient)}</strong><small>{item.recipient?.email}</small><small>Usuário #{item.recipient?.id ?? "—"}</small></td>
      <td>{label(item.type)}{item.description && <small>{item.description}</small>}</td><td className="pay-nowrap"><strong>{money(item.amountCents)}</strong></td>
      <td><StatusBadge status={item.status} />{item.date && <small>{item.dateLabel}: {dateTime(item.date)}</small>}</td>
    </tr>)}</tbody></table></div> : <Empty>A distribuição ainda não criou recebíveis ou recompensas.</Empty>}
    <h3 className="pay-subheading">Contas da plataforma</h3>
    {settlement.platformEntries?.length ? <div className="pay-table-wrap"><table className="pay-detail-table"><thead><tr><th>Conta / destino</th><th>Movimento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{settlement.platformEntries.map((item) => <tr key={item.id}><td><strong>{item.account ?? label(item.accountType)}</strong><small>{item.description}</small><small>{dateTime(item.at)}</small></td><td>{label(item.type)}</td><td className="pay-nowrap">{money(item.amountCents)}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div> : <Empty>Nenhum lançamento para a plataforma registrado.</Empty>}
    <h3 className="pay-subheading">Repasse bancário</h3>
    {settlement.transfer ? <div className="pay-transfer"><div><strong>{money(settlement.transfer.amountCents)}</strong><small>{settlement.transfer.gateway} · Repasse #{settlement.transfer.id}</small></div><StatusBadge status={settlement.transfer.status} /><p>Solicitado: {dateTime(settlement.transfer.requestedAt)} · Pago: {dateTime(settlement.transfer.paidAt)}</p>{settlement.transfer.failureReason && <p className="pay-error">{settlement.transfer.failureReason}</p>}</div> : <Empty>Nenhum repasse bancário registrado para esta transação. Os créditos em carteira aparecem em Movimentações.</Empty>}
  </>;
}

function Overview({ details }) {
  const { payment, deposit } = details;
  const recipient = details.recipient ?? details.settlement?.receivables?.[0]?.recipient;
  return <>
    <div className="pay-parties"><article><span><Users size={17} /> Quem pagou</span><strong>{personName(payment.payer)}</strong><p>{payment.payer?.email}</p><small>Usuário #{payment.payer?.id ?? "—"}</small></article><ArrowRight className="pay-parties-arrow" size={22} /><article><span><Store size={17} /> Destinatário</span><strong>{payment.store?.name ?? (deposit ? "Depósito em carteira" : personName(recipient))}</strong><p>{personName(recipient)}</p><small>{recipient?.email ?? "O beneficiário será identificado nos recebíveis."}</small></article></div>
    <div className="pay-facts"><Fact title="Pedido"><strong>{payment.orderCode ?? "Sem pedido de loja"}</strong>{payment.orderStatus && <small>{label(payment.orderStatus)}</small>}</Fact><Fact title="Criado em"><strong>{dateTime(payment.createdAt)}</strong></Fact><Fact title="Pagamento confirmado"><strong>{dateTime(payment.paidAt)}</strong></Fact><Fact title="Prazo de estorno automático"><strong>{dateTime(payment.refundDeadline)}</strong></Fact></div>
    <div className="pay-section-heading"><div><h3>De onde veio o valor</h3><p>Composição do pagamento de {money(payment.totalCents)}.</p></div><WalletCards size={20} /></div>
    <div className="pay-source-totals"><AmountRow title="Pix" value={payment.pixCents} /><AmountRow title="Carteiras" value={payment.walletCents} />{payment.cardCents > 0 && <AmountRow title="Cartão" value={payment.cardCents} />}</div>
    {details.sources?.length > 0 && <div className="pay-table-wrap"><table className="pay-detail-table"><thead><tr><th>Origem</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{details.sources.map((item) => <tr key={item.id}><td>{item.walletType ?? label(item.type)}</td><td>{money(item.amountCents)}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div>}
    {deposit && <article className="pay-breakdown pay-deposit"><h4>Crédito em {deposit.walletType ?? "carteira"}</h4><AmountRow title="Taxa de processamento" value={deposit.feeCents} /><AmountRow title={deposit.status === "CONFIRMADO" ? "Valor creditado" : "Valor a creditar"} value={deposit.creditedCents} /><StatusBadge status={deposit.status} /><p>Creditado em: {dateTime(deposit.creditedAt)}</p></article>}
    <h3 className="pay-subheading">Itens do pagamento</h3>
    {details.items?.length ? <div className="pay-table-wrap"><table className="pay-detail-table"><thead><tr><th>Produto / serviço</th><th>Quantidade</th><th>Unitário</th><th>Total</th></tr></thead><tbody>{details.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.quantity}</td><td>{money(item.unitCents)}</td><td>{money(item.totalCents)}</td></tr>)}</tbody></table></div> : <Empty>Este pagamento não possui itens vinculados.</Empty>}
    <h3 className="pay-subheading">Identificação e encerramento</h3><div className="pay-facts"><Fact title="Gateway"><strong>{payment.gateway}</strong><small>{payment.gatewayEnvironment ?? "Ambiente não informado"}</small></Fact><Fact title="Identificador no gateway"><strong>{payment.gatewayPaymentId ?? "Não registrado"}</strong></Fact><Fact title="Cancelado em"><strong>{dateTime(payment.canceledAt)}</strong></Fact><Fact title="Estornado em"><strong>{dateTime(payment.refundedAt)}</strong></Fact></div>
  </>;
}

function Ledger({ entries }) {
  return <><div className="pay-section-heading"><div><h3>Movimentações dos ganhos nas carteiras</h3><p>Os mesmos ganhos da distribuição, detalhados por lançamento. Valores pendentes ainda aguardam liberação.</p></div></div>
    {entries?.length ? <div className="pay-table-wrap"><table className="pay-detail-table"><thead><tr><th>Pessoa / carteira</th><th>Lançamento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{entries.map((item) => <tr key={item.id}><td><strong>{personName(item.recipient)}</strong><small>{item.recipient?.email}</small><small>{item.walletType} · Usuário #{item.recipient?.id}</small></td><td>{label(item.type)} · {label(item.origin)}<small>{item.description}</small><small>{dateTime(item.at)}</small></td><td className="pay-nowrap"><strong>{money(item.amountCents)}</strong></td><td><StatusBadge status={item.status} />{item.releasedAt && <small>Liberado: {dateTime(item.releasedAt)}</small>}{item.reversedAt && <small>Estornado: {dateTime(item.reversedAt)}</small>}</td></tr>)}</tbody></table></div> : <Empty>Ainda não existem lançamentos de ganhos vinculados a esta transação.</Empty>}</>;
}

function History({ details }) {
  const { payment } = details;
  const milestones = [["created", "Pagamento criado", payment.createdAt], ["paid", payment.sandboxSimulated ? "Pagamento aprovado no Sandbox" : "Pagamento confirmado", payment.paidAt], ["cancel", "Pagamento cancelado", payment.canceledAt], ["refund", "Pagamento estornado", payment.refundedAt], ["archive", "Arquivado da lista", payment.archivedAt]];
  const events = [...milestones.filter(([, , at]) => at).map(([id, title, at]) => ({ id, title, at, source: "Pagamento" })),
    ...(details.events ?? []).map((item) => ({ ...item, id: `financial-${item.id}`, title: label(item.type), source: "Financeiro" })),
    ...(details.gatewayEvents ?? []).map((item) => ({ ...item, id: `gateway-${item.id}`, title: label(item.type), source: "Gateway", description: item.processedAt ? `Processado em ${dateTime(item.processedAt)}` : "Aguardando processamento" })),
    ...(details.adminEvents ?? []).map((item) => ({ ...item, id: `admin-${item.id}`, title: label(item.event ?? item.type), source: `Admin · ${personName(item.actor)}`, description: item.reason })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  return <><div className="pay-section-heading"><div><h3>Histórico do pagamento</h3><p>Do evento mais recente ao mais antigo.</p></div><Clock3 size={20} /></div><ol className="pay-timeline">{events.map((event) => <li key={event.id}><span className="pay-timeline-dot" /><div><small>{event.source} · {dateTime(event.at)}</small><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}</div></li>)}</ol></>;
}

export function PaymentDetails({ details, loading, error, onClose, onRetry, onAction, onRefreshRefund, canManage, sandboxEnabled, busy, inert }) {
  const [tab, setTab] = useState("overview");
  const payment = details?.payment;
  return <PaymentDialog titleId="payment-details-title" onClose={onClose} className="pay-backdrop--details" busy={busy} inert={inert}>
    <header className="pay-dialog-header"><div><span className="pay-eyebrow">DETALHES DO PAGAMENTO</span><h2 id="payment-details-title">{payment ? `Pagamento #${payment.id}` : "Carregando pagamento"}</h2></div><CloseButton onClick={onClose} disabled={busy} /></header>
    {loading && !details ? <div className="pay-empty"><RefreshCw className="spin" /><p>Buscando pagamento e distribuição…</p></div> : error ? <div className="pay-empty"><p role="alert">{error}</p><button className="button button--secondary" type="button" onClick={onRetry}>Tentar novamente</button></div> : payment ? <>
      <div className="pay-detail-hero"><div><span>Valor do pagamento</span><strong>{money(payment.totalCents)}</strong><small>{payment.orderCode ?? label(payment.method)} · {payment.gateway}</small></div><div><StatusBadge status={payment.status} />{payment.sandboxSimulated && <small>Aprovado manualmente no Sandbox</small>}{payment.archivedAt && <small>Arquivado</small>}</div></div>
      <div className="pay-detail-layout"><aside className="pay-controls"><span className="pay-eyebrow">AÇÕES DO PAGAMENTO</span>
        {actionAvailability(payment, canManage, sandboxEnabled).map((action) => { const Icon = actionIcons[action.key]; return <div className="pay-control" key={action.key}><button type="button" disabled={!action.enabled || busy || loading} className={`pay-action pay-action--${action.key}`} onClick={() => onAction(action.key, payment)}><Icon size={17} />{action.title}</button><p>{action.reason}</p></div>; })}
        {canManage && payment.status === "EM_DISPUTA" && <button className="pay-action" disabled={busy || loading} type="button" onClick={() => payment.sandboxRefundable ? onAction("confirmRefund", payment) : onRefreshRefund(payment)}><RefreshCw size={17} />{payment.sandboxRefundable ? "Confirmar estorno de teste" : "Consultar estorno"}</button>}
      </aside><div className="pay-detail-main"><nav className="pay-tabs" aria-label="Seções do pagamento">{tabs.map(([id, title]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{title}</button>)}</nav><div className="pay-tab-content" aria-busy={loading}>
        {tab === "overview" && <Overview details={details} />}
        {tab === "distribution" && <Distribution details={details} />}
        {tab === "ledger" && <Ledger entries={details.walletEntries} />}
        {tab === "history" && <History details={details} />}
      </div></div></div>
    </> : null}
  </PaymentDialog>;
}
