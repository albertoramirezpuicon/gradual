"use client";

import { useState } from "react";

/** nginx site for a tenant domain; same proxy rules as docs/deploy/gradual.genia.pro.conf (ports 3110/4110). */
function nginxConf(fqdn: string) {
  const proxy = `        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;`;
  return `server {
    listen 80;
    server_name ${fqdn};
    client_max_body_size 2m;

    location /api/ {
        proxy_pass http://127.0.0.1:4110;
${proxy}
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3110;
${proxy}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}`;
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-lg bg-stone-900 p-3 pr-20 text-xs leading-relaxed text-stone-100">{children}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(children).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
        className="absolute right-2 top-2 rounded-md bg-stone-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-stone-600"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/** Step-by-step checklist to bring a new tenant domain online (D63). DNS and SSL are done by hand on purpose. */
export function SetupInstructions({ fqdn, sub }: { fqdn: string; sub: string }) {
  const conf = `/etc/nginx/sites-available/${fqdn}.conf`;
  return (
    <ol className="space-y-6 text-sm">
      <li>
        <p className="font-semibold">1. DNS: registro A</p>
        <p className="mt-1 text-stone-600">
          En la zona de <b>genia.pro</b>, crea un registro <b>A</b> con nombre <code>{sub}</code> que apunte a la misma IP pública que usa gradual.genia.pro. Puedes ver esa IP y luego comprobar el nuevo registro con:
        </p>
        <Code>{`dig +short gradual.genia.pro\ndig +short ${fqdn}`}</Code>
        <p className="mt-1 text-stone-600">Ambos deben devolver la misma IP antes de seguir.</p>
      </li>
      <li>
        <p className="font-semibold">2. nginx (en el servidor)</p>
        <Code>{`sudo tee ${conf} > /dev/null <<'EOF'\n${nginxConf(fqdn)}\nEOF\nsudo ln -s ${conf} /etc/nginx/sites-enabled/\nsudo nginx -t && sudo systemctl reload nginx`}</Code>
      </li>
      <li>
        <p className="font-semibold">3. Certificado SSL</p>
        <Code>{`sudo certbot --nginx -d ${fqdn}`}</Code>
      </li>
      <li>
        <p className="font-semibold">4. CORS del bucket S3</p>
        <p className="mt-1 text-stone-600">
          En S3 → <b>gradual-dev</b> → Permisos → CORS, agrega este origen a <code>AllowedOrigins</code> (sin quitar los existentes). Sin esto no podrán subir el logo ni archivos.
        </p>
        <Code>{`"https://${fqdn}"`}</Code>
      </li>
      <li>
        <p className="font-semibold">5. Comprobar</p>
        <p className="mt-1 text-stone-600">
          Abre <b>https://{fqdn}</b>: debe mostrar el inicio de sesión. La invitación del administrador apunta a este dominio; si la abrió antes de que estuviera listo, reenvíala desde «Administradores».
        </p>
      </li>
    </ol>
  );
}
