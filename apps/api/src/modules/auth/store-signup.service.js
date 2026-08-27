import QRCode from "qrcode";
import { AppError } from "../../utils/errors.js";
import {
  createStoreSignupRepository,
  storeSignupRepository,
} from "./store-signup.repository.js";

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

const storeRegistrationCodePattern = /^LOJA-(\d+)$/i;

export function createStoreRegistrationCode(storeId) {
  return `LOJA-${Number(storeId)}`;
}

export function isStoreRegistrationCode(value) {
  return storeRegistrationCodePattern.test(String(value ?? "").trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function findStoreSignupSource(database, storeSlug) {
  const repository = database
    ? createStoreSignupRepository(database)
    : storeSignupRepository;
  const store = await repository.findSourceBySlug(
    String(storeSlug ?? "").trim().toLowerCase(),
  );

  if (!store) {
    throw new AppError("Loja de origem nao esta disponivel para cadastro", 404);
  }

  if (store.lojista.usuario.excluido_em || store.lojista.usuario.status !== "ATIVO") {
    throw new AppError("O dono desta loja nao esta disponivel para receber cadastros", 409);
  }

  return store;
}

export async function findStoreSignupSourceByCode(database, registrationCode) {
  const match = String(registrationCode ?? "").trim().match(storeRegistrationCodePattern);

  if (!match) {
    throw new AppError("Codigo de loja invalido", 400);
  }

  const repository = database
    ? createStoreSignupRepository(database)
    : storeSignupRepository;
  const store = await repository.findSourceById(Number(match[1]));

  if (!store) {
    throw new AppError("Loja de origem nao esta disponivel para cadastro", 404);
  }

  if (store.lojista.usuario.excluido_em || store.lojista.usuario.status !== "ATIVO") {
    throw new AppError("O dono desta loja nao esta disponivel para receber cadastros", 409);
  }

  return store;
}

function signupUrl(baseUrl, storeSlug) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    throw new AppError("URL publica da API nao foi configurada", 503);
  }

  return `${normalizedBaseUrl}/cadastro/loja/${encodeURIComponent(storeSlug)}`;
}

export async function createStoreSignupQr(userId, storeId, publicBaseUrl, appDownloadUrl = null) {
  const id = Number(storeId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Loja invalida", 400);
  }

  const store = await storeSignupRepository.findAccessibleStore(userId, id);

  if (!store) {
    throw new AppError("Loja nao encontrada para gerar o cadastro", 404);
  }

  const registrationUrl = signupUrl(publicBaseUrl, store.slug);
  const appUrl = `detudoja://cadastro/loja/${encodeURIComponent(store.slug)}`;
  const registrationCode = createStoreRegistrationCode(store.id);

  return {
    appUrl,
    appDownloadUrl: appDownloadUrl || null,
    qrImageDataUrl: await QRCode.toDataURL(registrationUrl, {
      color: { dark: "#082E22", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
      margin: 1,
      width: 520,
    }),
    registrationCode,
    registrationUrl,
    shareMessage: `Cadastre-se no DeTudoJa pela ${store.nome}. Use o codigo ${registrationCode} ou abra ${registrationUrl}`,
    store: {
      id: store.id,
      logoUrl: store.logo_url,
      name: store.nome,
      slug: store.slug,
    },
  };
}

export function renderStoreSignupPage({ appDownloadUrl, store }) {
  const storeName = escapeHtml(store.nome);
  const storeSlug = escapeHtml(store.slug);
  const appUrl = `detudoja://cadastro/loja/${encodeURIComponent(store.slug)}`;
  const registrationCode = createStoreRegistrationCode(store.id);
  const downloadAction = appDownloadUrl
    ? `<a class="secondary" href="${escapeHtml(appDownloadUrl)}">Baixar o app DeTudoJa</a>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cadastro DeTudoJa</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { align-items: center; background: #f4faf6; color: #142019; display: flex; justify-content: center; margin: 0; min-height: 100vh; padding: 24px; }
    main { background: #fff; border: 1px solid #dce9e0; border-radius: 12px; box-shadow: 0 12px 30px rgba(20, 37, 28, .08); max-width: 440px; padding: 28px; width: 100%; }
    .brand { color: #07805c; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { font-size: 25px; line-height: 1.16; margin: 10px 0 8px; }
    p { color: #5e6d64; line-height: 1.5; margin: 0 0 20px; }
    form { display: grid; gap: 12px; }
    label { color: #29362f; display: grid; font-size: 13px; font-weight: 700; gap: 6px; }
    input { border: 1px solid #d4ddd7; border-radius: 8px; font: inherit; min-height: 48px; padding: 0 12px; width: 100%; }
    button, .secondary { align-items: center; background: #16a34a; border: 1px solid #16a34a; border-radius: 8px; color: #fff; cursor: pointer; display: flex; font-size: 15px; font-weight: 700; justify-content: center; min-height: 50px; padding: 0 16px; text-decoration: none; width: 100%; }
    .secondary { background: #ecfdf5; border-color: #bdeed0; color: #07805c; margin-top: 12px; }
    .code { align-items: center; background: #f4faf6; border: 1px solid #dce9e0; border-radius: 8px; display: flex; justify-content: space-between; margin: 16px 0; padding: 12px 14px; }
    .code span { color: #6b7b71; font-size: 12px; }
    .code strong { color: #07805c; font-size: 16px; }
    .app { margin-bottom: 12px; }
    #status { color: #5e6d64; font-size: 14px; line-height: 1.4; margin-top: 14px; min-height: 20px; }
    #status.error { color: #dc2626; }
    #status.success { color: #07805c; font-weight: 700; }
    .foot { font-size: 12px; margin-top: 18px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">DeTudoJa</div>
    <h1>Cadastre-se pela ${storeName}</h1>
    <p>Crie sua conta para comprar, pagar e receber cashback. Depois, entre no app com estes mesmos dados.</p>
    <a class="secondary app" href="${escapeHtml(appUrl)}">Abrir no app DeTudoJa</a>
    <div class="code"><span>Codigo da loja</span><strong>${registrationCode}</strong></div>
    <form id="register-form">
      <label>Nome completo<input name="name" autocomplete="name" minlength="3" required></label>
      <label>Telefone<input name="phone" autocomplete="tel" inputmode="tel" required></label>
      <label>E-mail<input name="email" autocomplete="email" inputmode="email" type="email" required></label>
      <label>CEP<input name="zipCode" autocomplete="postal-code" inputmode="numeric" maxlength="9" required></label>
      <label>Rua<input name="street" autocomplete="street-address" required></label>
      <label>Numero<input name="number" inputmode="numeric" required></label>
      <label>Bairro<input name="district" required></label>
      <label>Cidade<input name="city" autocomplete="address-level2" required></label>
      <label>UF<input name="state" autocomplete="address-level1" maxlength="2" required></label>
      <label>Senha<input name="password" autocomplete="new-password" minlength="8" type="password" required></label>
      <button id="submit" type="submit">Criar minha conta</button>
    </form>
    <div id="status" role="status"></div>
    ${downloadAction}
    <p class="foot">Voce entrara diretamente na rede do dono da loja ${storeName}. A loja e apenas o local de origem do cadastro.</p>
  </main>
  <script>
    const form = document.getElementById("register-form");
    const status = document.getElementById("status");
    const submit = document.getElementById("submit");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "";
      status.textContent = "Criando sua conta...";
      submit.disabled = true;
      const formData = new FormData(form);
      try {
        const response = await fetch("/api/app/auth/register", {
          body: JSON.stringify({
            address: {
              city: formData.get("city"),
              district: formData.get("district"),
              number: formData.get("number"),
              state: String(formData.get("state") || "").toUpperCase(),
              street: formData.get("street"),
              zipCode: formData.get("zipCode")
            },
            email: formData.get("email"),
            name: formData.get("name"),
            password: formData.get("password"),
            phone: formData.get("phone"),
            storeSlug: "${storeSlug}"
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Nao foi possivel concluir o cadastro.");
        form.hidden = true;
        status.className = "success";
        status.textContent = "Conta criada. Abra ou baixe o app DeTudoJa e entre com seu e-mail ou telefone.";
      } catch (error) {
        status.className = "error";
        status.textContent = error.message || "Nao foi possivel concluir o cadastro.";
      } finally {
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
