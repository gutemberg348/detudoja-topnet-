import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { matchesExternalDeliveryToken } from "./delivery-proof.js";

export async function previewExternalDelivery(orderId, token) {
  const id = parsePositiveId(orderId, "Pedido invalido");
  const order = await prisma.pedidoLoja.findUnique({
    select: {
      codigo: true,
      id: true,
      loja_id: true,
      loja: { select: { nome: true } },
      pagamento: { select: { status: true } },
      status: true,
      tipo_entrega: true,
    },
    where: { id },
  });
  if (!order || !matchesExternalDeliveryToken(order, token)) {
    throw new AppError("Link de entrega invalido", 404);
  }
  if (order.tipo_entrega !== "ENTREGA" || !["SAIU_ENTREGA", "CONCLUIDO"].includes(order.status)) {
    throw new AppError("Este link de entrega nao esta mais disponivel", 410);
  }
  return {
    completed: order.status === "CONCLUIDO",
    orderCode: order.codigo,
    storeName: order.loja.nome,
  };
}

export function renderExternalDeliveryPage(orderId) {
  const id = parsePositiveId(orderId, "Pedido invalido");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Confirmar entrega · Brasil Cashback</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f3f8f5;color:#162820;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
    main{width:min(100%,430px);padding:28px;border:1px solid #dcebe1;border-radius:24px;background:white;box-shadow:0 16px 50px #13382712}
    .brand{color:#087d59;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:27px;line-height:1.16;margin:13px 0 8px}p{color:#5d7065;margin:0 0 18px}
    .order{padding:13px 15px;background:#effaf3;border-radius:14px;margin-bottom:18px;font-weight:650}label{display:block;font-weight:700;font-size:13px;margin-bottom:8px}
    input{width:100%;border:1px solid #b5d8c5;border-radius:14px;padding:15px;font-size:26px;font-weight:700;letter-spacing:.24em;text-align:center;color:#123a2a}
    button{width:100%;border:0;border-radius:14px;padding:15px;margin-top:13px;background:#07845e;color:white;font-size:16px;font-weight:750;cursor:pointer}button:disabled{opacity:.5;cursor:default}
    .note{font-size:13px;margin:16px 0 0}.error{color:#b42318}.success{color:#067a53}#form,#order{display:none}
  </style>
</head>
<body>
  <main>
    <div class="brand">Brasil Cashback · entrega segura</div>
    <h1>Confirmar entrega</h1>
    <p id="intro">Conferindo o link do pedido...</p>
    <div class="order" id="order"></div>
    <form id="form">
      <label for="code">Código informado pelo cliente</label>
      <input id="code" name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" required aria-describedby="note">
      <button id="submit" type="submit">Confirmar que entreguei</button>
      <p class="note" id="note">Peça o código somente após entregar o pedido ao cliente. O link sozinho não confirma a entrega.</p>
    </form>
    <p id="message" role="status"></p>
  </main>
  <script>
    const orderId=${id};
    const token=new URLSearchParams(location.hash.slice(1)).get('token');
    const intro=document.getElementById('intro');
    const orderBox=document.getElementById('order');
    const form=document.getElementById('form');
    const message=document.getElementById('message');
    const submit=document.getElementById('submit');
    const code=document.getElementById('code');
    const endpoint='/api/public/entrega/'+orderId;
    async function post(path,body){
      const response=await fetch(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'Não foi possível continuar. Tente novamente.');
      return data;
    }
    if(!token){intro.textContent='Link incompleto. Peça um novo link à loja.';}
    else post('/preview',{token}).then(data=>{
      orderBox.textContent=data.storeName+' · pedido '+data.orderCode;
      orderBox.style.display='block';
      intro.textContent=data.completed?'Este pedido já foi confirmado.':'Peça o código ao cliente após entregar o pedido.';
      if(!data.completed)form.style.display='block';
    }).catch(error=>{intro.textContent=error.message;});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      message.textContent='';
      if(!/^[0-9]{4}$/.test(code.value)){message.textContent='Digite os 4 números do código.';message.className='error';return;}
      submit.disabled=true;
      try{
        await post('/complete',{token,code:code.value});
        form.style.display='none';
        intro.textContent='Entrega confirmada.';
        message.textContent='O pedido foi concluído e a loja e o cliente foram avisados.';
        message.className='success';
      }catch(error){message.textContent=error.message;message.className='error';submit.disabled=false;}
    });
  </script>
</body>
</html>`;
}
