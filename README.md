# LeadFlow

Sistema para captar clientes (leads) de empresas que **não têm site**, acompanhar cada contato e ver o lucro.

- **Buscar leads**: você informa nicho + cidade; o sistema consulta o Google Maps, confere se a empresa tem site e salva só as que valem a abordagem. Empresas repetidas são ignoradas.
- **Leads**: tabela com filtros, nota de chance (0–100), status, follow-up, histórico de tudo que aconteceu e exportação para Excel (CSV).
- **WhatsApp**: botão abre a conversa com mensagem pronta (editável) e já marca o lead como "Contatado".
- **Financeiro**: vendas, mensalidades e custos.
- **Painel**: lucro, receita, custos, receita recorrente, ticket médio, custo por cliente, meta do mês, funil e follow-ups.

## Rodar no seu computador

Precisa do Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env.local   # no Windows: copy .env.example .env.local
npm run dev
```

Preencha o `.env.local` (veja os comentários dentro de `.env.example`) e abra http://localhost:3100.
O login do primeiro usuário vem de `ADMIN_EMAIL` e `ADMIN_PASSWORD`; o usuário é criado quando o banco está vazio.

Sem `GOOGLE_MAPS_API_KEY` o sistema roda em **modo demonstração** (leads fictícios, marcados como "demo") para você testar tudo.
O passo a passo para obter a chave do Google está na tela **Configurações**.

## Uso no dia a dia (Windows)

- **`iniciar.bat`** (duplo clique): instala o que faltar, compila e abre o sistema em http://localhost:3100. É mais rápido e estável que o `npm run dev`, que serve para programar. Feche a janela preta para desligar.
- **`backup.bat`**: copia o banco (`local.db`: leads, vendas, custos) para a pasta `backups`. Faça de vez em quando e antes de atualizar o sistema.
- **Esqueci a senha:** `node scripts/reset-password.mjs seu@email.com NovaSenha123`
- **Abrir pelo celular na mesma rede Wi-Fi:** use o endereço `Network` que aparece na janela (algo como `http://192.168.0.10:3100`). Online, com HTTPS, é melhor: veja a seção abaixo.

## Testes automáticos

```bash
npm test          # roda tudo uma vez (cerca de 6 segundos)
npm run test:watch  # roda de novo a cada alteração
```

Os testes usam um banco temporário (pasta `.test-tmp`), nunca o seu `local.db`, e não chamam o Google nem enviam e-mail de verdade.
O que cobrem: nota e classificação de leads, telefones, dinheiro, busca no Google (com respostas simuladas), cota mensal (inclusive pedidos simultâneos),
limites de uso, login, sessão e troca de senha, lista de "não contatar", ações em lote, filtros, vendas/mensalidades/custos, lembretes,
exportação, resumo por e-mail, registro de erros, ajustes e a atualização de um banco antigo.

Rode `npm test` antes de publicar uma mudança. Se algum teste falhar, o nome dele diz o que quebrou.

## Colocar online (com login, acessível do celular)

Usa dois serviços com plano gratuito: **Vercel** (o site) e **Turso** (o banco).

1. **Turso** (turso.tech): crie um banco e copie a *URL* (`libsql://...`) e gere um *token*.
2. **Vercel** (vercel.com): importe este projeto (suba a pasta para um repositório no GitHub primeiro).
3. Em *Settings → Environment Variables* da Vercel, cadastre:

   | Variável | Valor |
   |---|---|
   | `AUTH_SECRET` | texto aleatório com 32+ caracteres |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | seu primeiro usuário |
   | `DATABASE_URL` | a URL `libsql://...` do Turso |
   | `DATABASE_AUTH_TOKEN` | o token do Turso |
   | `GOOGLE_MAPS_API_KEY` | sua chave (opcional no começo) |

4. Faça o deploy. As tabelas são criadas automaticamente no primeiro acesso.
5. Depois do primeiro login, troque a senha em **Configurações** e apague `ADMIN_PASSWORD` das variáveis.

## Trava contra cobrança do Google

O Google dá 1.000 requisições grátis por mês (busca com telefone e site) e cobra depois disso. O sistema conta cada requisição e **para de chamar o Google quando o mês chega ao limite** (padrão: 950, com folga):

- A reserva é feita no banco *antes* de chamar o Google, numa única instrução. Duas buscas ao mesmo tempo nunca passam juntas do limite.
- Uma busca que não cabe no que resta do mês nem chega a sair. A tela mostra o uso do mês e desativa o que não cabe.
- O limite volta a zero todo dia 1º. Mude em **Configurações**. Passar de 1.000 exige marcar uma confirmação de que o Google vai cobrar; `0` desliga as buscas reais.
- No painel só entra como custo o que passar das 1.000 grátis.
- A trava só vale para buscas feitas pelo sistema. Não compartilhe a chave e restrinja-a à Places API (New) no Google Cloud. Alertas de orçamento do Google só avisam, não bloqueiam.

## Como a nota de chance é calculada

| Critério | Pontos |
|---|---|
| Sem site / só rede social / tem site | 40 / 30 / 0 |
| Telefone celular / fixo / nenhum | 20 / 8 / 0 |
| Avaliações no Google (100+ / 30+ / 10+ / 3+) | 20 / 14 / 8 / 4 |
| Nota no Google (4,5+ / 4,0+ / 3,5+) | 20 / 14 / 7 |

70+ é **quente**, 45–69 **morno**, abaixo disso **frio**. A lógica fica em `lib/scoring.ts`.

## Observações importantes

- O Google às vezes mostra o Instagram ou um link de bio como "site". O sistema detecta esses casos e classifica como **só rede social** (leads muito bons para vender um site próprio).
- Não há envio automático em massa de WhatsApp de propósito: números que fazem isso costumam ser banidos. O botão abre a conversa e você envia.
- Contatar empresas por dados públicos de negócios é prática comum, mas respeite quem pedir para não ser contatado (use o status "Perdido" e a observação).
- O custo da API do Google é estimado por requisição (configurável) e entra nos custos do painel automaticamente.

## Próximos passos possíveis

- Captação pelo Instagram (colar @ ou link e checar o link da bio).
- Kanban para arrastar leads entre as etapas.
- Lembretes de follow-up por e-mail ou WhatsApp.
- Sincronização com o Google Sheets.
