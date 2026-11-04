import { Suspense } from "react";
import { DirectMessagePage } from "@/components/messages/direct-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DirectMessagePage />
    </Suspense>
  );
}
