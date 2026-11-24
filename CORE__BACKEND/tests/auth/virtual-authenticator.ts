import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

// A software authenticator for tests. It makes the same bytes a platform authenticator makes:
// CBOR attestation objects with a COSE P-256 key, and ES256 assertions over authenticator data.

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export interface RegisterInput {
  challenge: string;
  origin: string;
  userVerified?: boolean | undefined;
}

export interface AssertInput {
  challenge: string;
  origin: string;
  userVerified?: boolean | undefined;
  /** Sets the counter the authenticator reports. Omit it to count up by one. */
  signCount?: number | undefined;
}

type CborInput =
  number | string | Uint8Array | Map<number | string, CborInput> | { [key: string]: CborInput };

function cborHead(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 0x100) return Buffer.from([(major << 5) | 24, value]);
  if (value < 0x10000) {
    const head = Buffer.alloc(3);
    head[0] = (major << 5) | 25;
    head.writeUInt16BE(value, 1);
    return head;
  }
  const head = Buffer.alloc(5);
  head[0] = (major << 5) | 26;
  head.writeUInt32BE(value, 1);
  return head;
}

/** Encodes the CBOR subset WebAuthn needs: integers, byte and text strings, maps. */
export function cbor(value: CborInput): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([cborHead(2, value.length), Buffer.from(value)]);
  }
  const entries: Array<[number | string, CborInput]> =
    value instanceof Map ? [...value.entries()] : Object.entries(value);
  return Buffer.concat([
    cborHead(5, entries.length),
    ...entries.flatMap(([key, item]) => [cbor(key), cbor(item)]),
  ]);
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value, 0);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export class VirtualAuthenticator {
  readonly credentialId: Buffer;
  private readonly rpId: string;
  private readonly privateKey: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;
  private counter = 0;

  constructor(rpId: string, credentialId?: Buffer) {
    this.rpId = rpId;
    this.credentialId = credentialId ?? randomBytes(16);
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = pair.privateKey;
    const jwk = pair.publicKey.export({ format: 'jwk' });
    this.x = Buffer.from(jwk.x ?? '', 'base64url');
    this.y = Buffer.from(jwk.y ?? '', 'base64url');
  }

  /** The id as the browser sends it: base64url text. */
  get id(): string {
    return toBase64Url(this.credentialId);
  }

  private rpIdHash(): Buffer {
    return createHash('sha256').update(this.rpId).digest();
  }

  /** Makes a registration answer for a challenge the server issued. */
  register(input: RegisterInput) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: input.challenge,
        origin: input.origin,
        crossOrigin: false,
      }),
    );
    const coseKey = cbor(
      new Map<number, CborInput>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.x],
        [-3, this.y],
      ]),
    );
    const flags = FLAG_UP | FLAG_AT | (input.userVerified === false ? 0 : FLAG_UV);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([flags]),
      uint32(this.counter),
      Buffer.alloc(16),
      Buffer.from([0, this.credentialId.length]),
      this.credentialId,
      coseKey,
    ]);
    const attestationObject = cbor({ fmt: 'none', attStmt: {}, authData });
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64Url(clientDataJSON),
        attestationObject: toBase64Url(attestationObject),
        transports: ['internal'],
      },
    };
  }

  /** Makes a sign-in answer for a challenge the server issued. Signs with the key registered above. */
  assert(input: AssertInput) {
    this.counter = input.signCount ?? this.counter + 1;
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: input.challenge,
        origin: input.origin,
        crossOrigin: false,
      }),
    );
    const flags = FLAG_UP | (input.userVerified === false ? 0 : FLAG_UV);
    const authData = Buffer.concat([this.rpIdHash(), Buffer.from([flags]), uint32(this.counter)]);
    const clientHash = createHash('sha256').update(clientDataJSON).digest();
    const signature = sign('sha256', Buffer.concat([authData, clientHash]), this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64Url(clientDataJSON),
        authenticatorData: toBase64Url(authData),
        signature: toBase64Url(signature),
      },
    };
  }
}
