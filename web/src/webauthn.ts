import { deBase64Url, paraBase64Url } from './codec.js';

type Descritor = { id: string; type?: string; transports?: AuthenticatorTransport[] };

export type OpcoesServidor = {
  challenge: string;
  timeout?: number;
  rp?: { name: string; id?: string };
  user?: { id: string; name: string; displayName: string };
  pubKeyCredParams?: Array<{ type: PublicKeyCredentialType; alg: number }>;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: Descritor[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  rpId?: string;
  allowCredentials?: Descritor[];
  userVerification?: UserVerificationRequirement;
};

export function opcoesDeCriacao(opcoes: OpcoesServidor): PublicKeyCredentialCreationOptions {
  if (!opcoes.rp || !opcoes.user || !opcoes.pubKeyCredParams) {
    throw new Error('Opções de registro incompletas.');
  }
  return {
    challenge: bytes(opcoes.challenge),
    rp: opcoes.rp,
    user: {
      id: bytes(opcoes.user.id),
      name: opcoes.user.name,
      displayName: opcoes.user.displayName,
    },
    pubKeyCredParams: opcoes.pubKeyCredParams,
    timeout: opcoes.timeout,
    attestation: opcoes.attestation,
    excludeCredentials: descritores(opcoes.excludeCredentials),
    authenticatorSelection: opcoes.authenticatorSelection,
  };
}

export function opcoesDeLogin(opcoes: OpcoesServidor): PublicKeyCredentialRequestOptions {
  return {
    challenge: bytes(opcoes.challenge),
    timeout: opcoes.timeout,
    rpId: opcoes.rpId,
    allowCredentials: descritores(opcoes.allowCredentials),
    userVerification: opcoes.userVerification,
  };
}

export function credencialParaEnvio(credencial: PublicKeyCredential): Record<string, unknown> {
  const comJson = credencial as PublicKeyCredential & { toJSON?: () => Record<string, unknown> };
  if (typeof comJson.toJSON === 'function') return comJson.toJSON();
  const resposta = credencial.response;
  const corpo: Record<string, unknown> = {
    clientDataJSON: paraBase64Url(new Uint8Array(resposta.clientDataJSON)),
  };
  if ('attestationObject' in resposta) {
    const atestado = resposta as AuthenticatorAttestationResponse;
    corpo.attestationObject = paraBase64Url(new Uint8Array(atestado.attestationObject));
    if (typeof atestado.getTransports === 'function') corpo.transports = atestado.getTransports();
  } else {
    const afirmacao = resposta as AuthenticatorAssertionResponse;
    corpo.authenticatorData = paraBase64Url(new Uint8Array(afirmacao.authenticatorData));
    corpo.signature = paraBase64Url(new Uint8Array(afirmacao.signature));
    if (afirmacao.userHandle) corpo.userHandle = paraBase64Url(new Uint8Array(afirmacao.userHandle));
  }
  return {
    id: credencial.id,
    rawId: paraBase64Url(new Uint8Array(credencial.rawId)),
    type: credencial.type,
    response: corpo,
  };
}

function bytes(texto: string): Uint8Array<ArrayBuffer> {
  const cru = deBase64Url(texto);
  return new Uint8Array(cru);
}

function descritores(lista: Descritor[] | undefined): PublicKeyCredentialDescriptor[] | undefined {
  if (!lista) return undefined;
  return lista.map((item) => ({
    type: 'public-key',
    id: bytes(item.id),
    transports: item.transports,
  }));
}
