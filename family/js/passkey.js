// WebAuthn glue. Options are fetched before the tap so the browser call happens inside the tap (iOS).
function b64uToBuf(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bufToB64u(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function supported() {
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

function creationOptions(o) {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(o);
  return {
    ...o,
    challenge: b64uToBuf(o.challenge),
    user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })),
  };
}

function requestOptions(o) {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(o);
  return { ...o, challenge: b64uToBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
}

function credJSON(c) {
  if (typeof c.toJSON === 'function') {
    try { return c.toJSON(); } catch { /* fall through */ }
  }
  const r = c.response;
  const out = { id: c.id, rawId: bufToB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, authenticatorAttachment: c.authenticatorAttachment || undefined, response: { clientDataJSON: bufToB64u(r.clientDataJSON) } };
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64u(r.attestationObject);
    out.response.transports = r.getTransports ? r.getTransports() : [];
  } else {
    out.response.authenticatorData = bufToB64u(r.authenticatorData);
    out.response.signature = bufToB64u(r.signature);
    if (r.userHandle) out.response.userHandle = bufToB64u(r.userHandle);
  }
  return out;
}

export async function create(optionsJSON) {
  const c = await navigator.credentials.create({ publicKey: creationOptions(optionsJSON) });
  return credJSON(c);
}

export async function get(optionsJSON) {
  const c = await navigator.credentials.get({ publicKey: requestOptions(optionsJSON) });
  return credJSON(c);
}
