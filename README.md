# FMC Policies Viewer (Vue 3 + Tailwind + Vite)

Pequeña app que:
1) Autentica contra **Cisco FMC** (sandbox) usando `generatetoken` (Basic Auth).
2) Obtiene `domainUUID` desde `/api/fmc_platform/v1/info/domain`.
3) Lista **Access Policies** de `/api/fmc_config/v1/domain/{domainUUID}/policy/accesspolicies` con paginación.

> ⚠️ En desarrollo se usa el **proxy de Vite** para evitar CORS (`/fmc` → `https://fmcrestapisandbox.cisco.com`).

## Requisitos
- Node 18+

## Ejecutar
```bash
npm i
npm run dev
```

Abrir la URL local que te muestre Vite. Ingresar usuario y contraseña del sandbox.

## Build
```bash
npm run build
npm run preview
```

## Despliegue / Producción
En producción, coloca un **reverse proxy** (Nginx/Caddy) que reescriba `/fmc` al host real de FMC y **pase** los headers `X-auth-access-token` y `X-auth-refresh-token` de vuelta al navegador.

Ejemplo Nginx (snippet):
```nginx
location /fmc/ {
  proxy_pass https://fmcrestapisandbox.cisco.com/;
  proxy_set_header Host fmcrestapisandbox.cisco.com;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Seguridad
- No hardcodees credenciales; esta app las pide por formulario.
- Los tokens se reciben por **headers**. No los guardes en `localStorage`; aquí se mantienen en memoria y expiran.
- Considera montar un **BFF** (Backend For Frontend) en prod para ofuscar credenciales y tokens si tu org lo requiere.

## Extras sugeridos
- Exportar políticas a CSV.
- Ver **Access Rules** de una policy seleccionada.
- Filtro/búsqueda por nombre.
