// import { useEffect, useState } from "react";
// import { PageHead } from "@/modules/shell";
// import { Button } from "@/shared/ui/Button";
// import { Card } from "@/shared/ui/Card";
// import { EmptyState } from "@/shared/ui/EmptyState";
// import { errorText } from "@/shared/lib/api";
// import { fmtDateTime } from "@/shared/lib/format";
// import { notify } from "@/shared/lib/toast";
// import { listDeviceSessions, revokeDeviceSession, type DeviceSession } from "../api/sessions";

// /**
//  * The devices this account is signed in on. Signing another device out ends its sign-in at once; this device is
//  * marked, and it is signed out from the account menu instead.
//  */
// export default function Devices() {
//   const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
//   const [busyId, setBusyId] = useState("");

//   const load = () =>
//     listDeviceSessions()
//       .then(setSessions)
//       .catch((err) => notify(`Could not load devices: ${errorText(err)}`, 6000));

//   useEffect(() => {
//     void load();
//   }, []);

//   const signOut = async (session: DeviceSession) => {
//     if (!window.confirm("Sign this device out? It will need to sign in again.")) return;
//     setBusyId(session.id);
//     try {
//       await revokeDeviceSession(session.id);
//       notify("Device signed out");
//       await load();
//     } catch (err) {
//       notify(`Not signed out: ${errorText(err)}`, 6000);
//     } finally {
//       setBusyId("");
//     }
//   };

//   return (
//     <>
//       <PageHead
//         crumb="Account"
//         title="Devices"
//         desc="The devices this account is signed in on. Sign out a device you no longer use."
//       />
//       <Card title="Signed-in devices">
//         {sessions === null ? (
//           <p>Loading…</p>
//         ) : sessions.length === 0 ? (
//           <EmptyState icon="shield" title="No devices signed in">
//             Sign in again to see this device here.
//           </EmptyState>
//         ) : (
//           <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 12 }}>
//             {sessions.map((s) => (
//               <li key={s.id} className="row-actions" style={{ justifyContent: "space-between" }}>
//                 <span>
//                   <strong>{s.deviceLabel ?? "Browser"}</strong>
//                   {s.current ? " · this device" : ""}
//                   <br />
//                   <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
//                     Signed in {fmtDateTime(s.issuedAt)} · until {fmtDateTime(s.expiresAt)}
//                   </span>
//                 </span>
//                 {!s.current && (
//                   <Button size="sm" tone="danger" disabled={busyId === s.id} onClick={() => void signOut(s)}>
//                     Sign out
//                   </Button>
//                 )}
//               </li>
//             ))}
//           </ul>
//         )}
//       </Card>
//     </>
//   );
// }
