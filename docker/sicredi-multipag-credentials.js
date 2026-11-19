export function readMultipagPair(text) {
  const values = new Map();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*(SICREDI_MULTIPAG_(?:CLIENT_ID|CLIENT_SECRET|ENV))=(.*)$/.exec(line);
    if (!match) continue;
    const [, name, value] = match;
    if (values.has(name)) throw new Error(`Variável duplicada: ${name}`);
    if (!value || value.trim() !== value || /^(["']).*\1$/.test(value)) {
      throw new Error(`Confira espaços, aspas e preenchimento de ${name}`);
    }
    values.set(name, value);
  }
  if (values.has('SICREDI_MULTIPAG_ENV') && values.get('SICREDI_MULTIPAG_ENV') !== 'production') {
    throw new Error('O ambiente indicado no arquivo Multipag precisa ser production.');
  }
  const clientId = values.get('SICREDI_MULTIPAG_CLIENT_ID');
  const clientSecret = values.get('SICREDI_MULTIPAG_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Falta o ID ou Secret Multipag no arquivo selecionado.');
  if (clientId === 'multipag-sandbox-client') throw new Error('O ID informado é o do sandbox Multipag.');
  return { clientId, clientSecret };
}
