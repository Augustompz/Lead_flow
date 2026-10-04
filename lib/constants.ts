export const STATUSES = [
  { key: "novo", label: "Novo" },
  { key: "contatado", label: "Chamado" },
  { key: "respondeu", label: "Respondeu" },
  { key: "proposta", label: "Proposta enviada" },
  { key: "fechado", label: "Fechado" },
  { key: "perdido", label: "Perdido" },
] as const;

export type Status = (typeof STATUSES)[number]["key"];

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.label]),
);

/** Explicação curta de cada status, para quem está começando. */
export const STATUS_HELP: Record<string, string> = {
  novo: "Ainda ninguém falou com essa empresa.",
  contatado: "Você já mandou a primeira mensagem.",
  respondeu: "A empresa respondeu. Hora de conversar.",
  proposta: "Você enviou um orçamento ou exemplo.",
  fechado: "Virou cliente.",
  perdido: "Não vai seguir. Guarde o motivo para aprender.",
};

/** Etapas do funil na ordem; cada uma guarda a data em que o lead chegou nela. */
export const FUNNEL_STAGES = [
  { key: "novo", label: "Encontrados", column: "created_at" },
  { key: "contatado", label: "Chamados", column: "contacted_at" },
  { key: "respondeu", label: "Responderam", column: "responded_at" },
  { key: "proposta", label: "Proposta enviada", column: "proposal_at" },
  { key: "fechado", label: "Fechados", column: "closed_at" },
] as const;

export const STAGE_COLUMN: Record<string, string> = {
  contatado: "contacted_at",
  respondeu: "responded_at",
  proposta: "proposal_at",
  fechado: "closed_at",
};

export const STAGE_ORDER = ["novo", "contatado", "respondeu", "proposta", "fechado"];

export const COST_CATEGORIES = [
  { key: "dominio", label: "Domínio" },
  { key: "hospedagem", label: "Hospedagem" },
  { key: "ferramentas", label: "Ferramentas / assinaturas" },
  { key: "anuncios", label: "Anúncios" },
  { key: "freelancer", label: "Freelancer" },
  { key: "impostos", label: "Impostos / taxas" },
  { key: "outros", label: "Outros" },
] as const;

export const COST_LABEL: Record<string, string> = Object.fromEntries(
  COST_CATEGORIES.map((c) => [c.key, c.label]),
);

export const SERVICE_SUGGESTIONS = [
  "Site institucional",
  "Landing page",
  "Loja virtual",
  "Site + Google Meu Negócio",
  "Manutenção mensal",
];

/** Sugestões de nicho na tela de busca. */
export const NICHE_SUGGESTIONS = [
  "dentista",
  "barbearia",
  "salão de beleza",
  "advogado",
  "personal trainer",
  "pet shop",
  "oficina mecânica",
  "nutricionista",
];

export const SITE_STATUS_LABEL: Record<string, string> = {
  none: "Sem site",
  social: "Só rede social",
  own: "Tem site",
};

export const DEFAULT_MESSAGE =
  "Olá! Tudo bem? Vi a {nome} aqui no Google e percebi que vocês ainda não têm um site próprio. " +
  "Eu crio sites profissionais para {nicho} e posso te mostrar como ficaria o de vocês, sem compromisso. " +
  "Posso te enviar um exemplo?";

export const SETTING_DEFAULTS = {
  msg_template: DEFAULT_MESSAGE,
  meta_mensal: "0", // centavos
  custo_requisicao: "20", // centavos de real por requisição à API do Google
  // Trava do app: o Google dá 1.000 requisições grátis/mês (Text Search Enterprise);
  // 950 deixa folga para a virada de mês, que no Google segue outro fuso.
  limite_requisicoes: "950",
} as const;

/** Requisições grátis por mês no Google (Text Search Enterprise). Confira em developers.google.com/maps/billing-and-pricing/pricing */
export const GOOGLE_FREE_REQUESTS = 1000;
/** Empresas que o Google devolve por requisição. */
export const RESULTS_PER_REQUEST = 20;
