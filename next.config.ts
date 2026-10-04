import type { NextConfig } from "next";

// Cabeçalhos de segurança do navegador, em todas as páginas.
const securityHeaders = [
  // Ninguém pode colocar o sistema dentro de outro site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Só HTTPS por 1 ano (o navegador ignora em http://localhost).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    // O Next.js usa scripts embutidos, então não restringimos script-src; fechamos o resto.
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  // O cliente do banco usa um binário nativo; precisa ficar fora do bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Permite abrir o servidor de desenvolvimento pelo IP da rede (ex.: celular no mesmo Wi-Fi).
  // Sem isso o navegador carrega a página, mas ela não "liga" e o login não funciona.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Há outro package-lock.json na pasta do usuário; fixa a raiz neste projeto.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
