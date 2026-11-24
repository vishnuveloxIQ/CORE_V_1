import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { PageHead } from "@/modules/shell";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { errorText } from "@/shared/lib/api";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import {
  deletePasskey,
  listPasskeys,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  type PasskeyRegistrationResponse,
  type PasskeyView,
} from "../api";

/** The signed-in user's passkeys: add one from this device, or remove one. Passkeys are how the user signs in without a password. */
export default function Passkeys() {
  const [items, setItems] = useState<PasskeyView[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    listPasskeys()
      .then(setItems)
      .catch((err) => notify(`Could not load passkeys: ${errorText(err)}`, 6000));

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setBusy(true);
    try {
      const options = await passkeyRegisterOptions();
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      await passkeyRegisterVerify(response as unknown as PasskeyRegistrationResponse, "This device");
      notify("Passkey added");
      await load();
    } catch (err) {
      notify(`Passkey not added: ${errorText(err)}`, 6000);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this passkey? You can add it again later.")) return;
    setBusy(true);
    try {
      await deletePasskey(id);
      notify("Passkey removed");
      await load();
    } catch (err) {
      notify(`Passkey not removed: ${errorText(err)}`, 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        crumb="Account"
        title="Passkeys"
        desc="Sign in with this device's fingerprint, face or security key instead of a password."
      />
      <Card
        title="Your passkeys"
        action={
          <Button tone="primary" icon="fingerprint" disabled={busy} onClick={() => void add()}>
            Add a passkey
          </Button>
        }
      >
        {items === null ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState icon="fingerprint" title="No passkeys yet">
            Add one to sign in without typing your password.
          </EmptyState>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 12 }}>
            {items.map((p) => (
              <li key={p.id} className="row-actions" style={{ justifyContent: "space-between" }}>
                <span>
                  <strong>{p.label ?? "Passkey"}</strong> · added {fmtDate(p.createdAt)}
                </span>
                <Button size="sm" disabled={busy} onClick={() => void remove(p.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
