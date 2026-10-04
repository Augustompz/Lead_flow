# LeadFlow

Aplicação web para quem vende criação de sites. Ela busca empresas no Google Maps, separa as que não têm site, guarda numa lista com status e histórico, abre o WhatsApp com uma mensagem pronta e mostra quanto entrou e saiu no mês.

Feito com Next.js, SQLite (libSQL) e Tailwind. Em produção roda na Vercel com um banco no Turso.

## Rodando localmente

Precisa de Node 20 ou mais novo.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Edite o `.env.local` (cada variável está explicada em `.env.example`) e abra http://localhost:3100. O primeiro usuário é criado a partir de `ADMIN_EMAIL` e `ADMIN_PASSWORD` quando o banco está vazio.

Sem `GOOGLE_MAPS_API_KEY` a busca gera empresas fictícias, marcadas como "demo", só para testar o fluxo. Para buscar de verdade é preciso uma chave da Places API (New); o passo a passo está na tela Ajustes.

No Windows, `iniciar.bat` instala, compila e abre o sistema, e `backup.bat` copia o `local.db` para a pasta `backups`. Se esquecer a senha:

```bash
node scripts/reset-password.mjs email@exemplo.com NovaSenha123
```

## Testes

```bash
npm test
```

Usa o Vitest com um banco temporário em `.test-tmp`. Nada de rede: o Google e o serviço de e-mail são simulados.

## Publicando

1. No Turso, crie um banco e gere um token.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis de ambiente abaixo.
4. Faça o deploy. As tabelas são criadas no primeiro acesso.

| Variável | Para quê |
|---|---|
| `AUTH_SECRET` | assinatura do login, texto aleatório com 32+ caracteres |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | primeiro usuário |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | banco no Turso |
| `GOOGLE_MAPS_API_KEY` | busca real |
| `RESEND_API_KEY`, `ALERT_EMAIL`, `CRON_SECRET` | opcional: resumo diário de retornos e aviso de erros por e-mail |

Depois do primeiro login, troque a senha em Ajustes e remova `ADMIN_PASSWORD` das variáveis.

## Custo da API do Google

A busca com telefone e site cai na faixa Text Search Enterprise, que tem 1.000 requisições grátis por mês e é cobrada depois disso. Cada requisição devolve até 20 empresas.

O sistema reserva as requisições no banco antes de chamar o Google e recusa a busca que passaria do limite do mês (padrão 950). Passar de 1.000 exige confirmar em Ajustes. A trava só vale para buscas feitas pela aplicação, então a chave deve ser restrita à Places API (New) e não compartilhada.

## Nota de chance

Soma de quatro critérios, de 0 a 100:

| Critério | Pontos |
|---|---|
| Sem site / só rede social / com site | 40 / 30 / 0 |
| Celular / fixo / sem telefone | 20 / 8 / 0 |
| Avaliações no Google: 100+, 30+, 10+, 3+ | 20 / 14 / 8 / 4 |
| Nota no Google: 4,5+, 4,0+, 3,5+ | 20 / 14 / 7 |

70 ou mais é alta, de 45 a 69 média, abaixo disso baixa. O cálculo está em `lib/scoring.ts`.

Quando o Google lista um Instagram ou link de bio como "site", o lead é classificado como "só rede social".

## Observações

- O WhatsApp não é enviado automaticamente: o botão abre a conversa e a mensagem é enviada manualmente.
- Quem pede para não ser contatado vai para a lista de "não contatar" e não volta mais nas buscas, mesmo que o lead seja apagado.
