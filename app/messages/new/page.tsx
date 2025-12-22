// app/messages/new/page.tsx
import { Suspense } from "react";
import NewMessageClient from "./NewMessageClient";

export default function NewMessagePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 16, fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
          読み込み中…
        </div>
      }
    >
      <NewMessageClient />
    </Suspense>
  );
}