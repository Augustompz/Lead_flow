"use client";

import { startTransition } from "react";
import { whatsappClickedAction } from "@/app/actions/leads";
import { Icon } from "./Icon";

/** Abre o WhatsApp com a mensagem pronta e registra o contato no histórico do lead. */
export function WhatsAppButton({
  leadId,
  href,
  mobile,
  small = true,
  label = "Chamar",
}: {
  leadId: number;
  href: string;
  mobile: boolean;
  small?: boolean;
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-whats ${small ? "btn-sm" : ""}`}
      title={mobile ? "Abrir conversa no WhatsApp com a mensagem pronta" : "Telefone fixo: pode não ter WhatsApp"}
      onClick={() => startTransition(() => whatsappClickedAction(leadId))}
    >
      <Icon name="chat" size={small ? 16 : 18} />
      {label}
      {!mobile && <span className="font-normal opacity-80">(fixo)</span>}
    </a>
  );
}
