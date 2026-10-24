import { redirect } from "next/navigation";

export default function TeamPage() {
  redirect("/configuracoes?tab=equipe");
}
