<div align="center">
  <h1>🐼 PandaFactory POS (PandaStoreOS)</h1>
  <p><strong>Sistema Avanzado de Punto de Venta, Inventario y Logística de Importación para Panda Store (Nicaragua)</strong></p>
</div>

---

**PandaFactory POS** es el corazón operativo de Panda Store. Un sistema integral diseñado a medida para gestionar desde la venta al mostrador hasta la complejidad logística de importar productos, calcular costos exactos (Landed Cost) y mantener sincronizado el catálogo público para el piso de ventas.

## ✨ Características Principales

*   **🛒 Punto de Venta (POS) Ágil:** Interfaz optimizada para facturación rápida, manejo de proformas, múltiples métodos de pago y soporte bi-monetario (NIO/USD).
*   **📦 Gestión de Inventario Avanzada:** Control estricto de existencias, cálculo automático de costo promedio ponderado y alertas de stock bajo.
*   **🚢 Logística de Importación (Landed Cost):** Registro de compras, trackings, fletes marítimos/aéreos y prorrateo automático de gastos aduaneros para obtener el costo real del producto puesto en tienda.
*   **🤝 CRM Integrado:** Gestión de clientes y proveedores, historial de ventas y seguimientos.
*   **📱 Ecosistema Omnicanal:** Alimenta directamente a **PandaLink** (la PWA utilizada en las tablets del piso de venta) proyectando catálogos, fichas técnicas y manejo de objeciones comerciales.

---

## 🛠️ Stack Tecnológico

El proyecto está construido con un enfoque moderno, priorizando la velocidad y el bajo costo de infraestructura:

*   **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4.
*   **Backend & Base de Datos:** Firebase Firestore (Base de datos nombrada).
*   **Autenticación:** Firebase Auth (Email/Password con *custom claim* `admin` para staff).
*   **Infraestructura:** Desplegado en Vercel, operando 100% serverless en el plan Spark (gratuito) de Firebase.

---

## 🚀 Instalación y Entorno de Desarrollo

### Requisitos Previos
*   [Node.js](https://nodejs.org/) (versión 20+ recomendada).
*   Una cuenta de Firebase con el proyecto configurado.

### Configuración Rápida

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Tamuga23/PandaFactoryPOS.git
   cd PandaFactoryPOS
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Variables de entorno:**
   Duplica el archivo `.env.example`, renómbralo a `.env` y configura tus variables de Firebase.

4. **Levantar el entorno local:**
   ```bash
   npm run dev
   ```
   El sistema estará disponible en `http://localhost:3000`.

### Comandos Útiles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo local. |
| `npm run build` | Compila la aplicación para producción en la carpeta `dist/`. |
| `npm run lint` | Ejecuta TypeScript (`tsc --noEmit`) para validar tipos de datos. |
| `npm run test:rules` | Ejecuta las pruebas de seguridad de Firestore (requiere Emulador). |

---

## 🔄 Sincronización con PandaLink (Backfill)

La colección `catalogo_publico` es una proyección segura de `products` (omitiendo costos sensibles) consumida por la tablet de ventas. Como operamos en el plan **Spark**, no utilizamos Cloud Functions, por lo que el catálogo se sincroniza mediante un script local:

1. **Autenticación:** Asegúrate de tener la variable `GOOGLE_APPLICATION_CREDENTIALS` apuntando a tu `service account` de Firebase (¡Mantenlo fuera de git!).
2. **Simular:** `npm run backfill:dry` (Muestra qué cambios se harían sin afectar la BD).
3. **Ejecutar:** `npm run backfill` (Aplica la sincronización).

*Nota: Ejecuta esto cada vez que cambies precios, descripciones o visibilidad de productos para la tablet.*

---

## 📂 Arquitectura y Estructura

*   `/src/pages/` — Rutas principales (POS, Inventario, Compras, CRM, Reportes, Dashboard).
*   `/src/hooks/useStoreData.ts` — Capa de datos y suscripciones en tiempo real a Firestore. Transacciones seguras.
*   `/src/lib/validations.ts` — Esquemas de validación estrictos usando **Zod**.
*   `/firestore.rules` — Reglas de seguridad de la base de datos (Fase 2 de seguridad completada).
*   `/scripts/` — Scripts de mantenimiento y backfill (usan `firebase-admin`).

---

## 📖 Documentación Interna para Desarrolladores

Si te unes al proyecto o eres un Agente de IA trabajando en este repositorio, **es obligatorio leer estos documentos**:

*   [**AGENTS.md**](./AGENTS.md): Reglas estrictas y estado del arte para agentes IA.
*   [**PRODUCT.md**](./PRODUCT.md): Promesa de producto y visión funcional.
*   [**DESIGN.md**](./DESIGN.md): Sistema de diseño UI/UX (Basado en Tailwind v4).
*   [**REVISION_2026-07-07_MEJORAS.md**](./REVISION_2026-07-07_MEJORAS.md): Historial de mejoras y backlog vigente.
*   [**security_spec.md**](./security_spec.md): Invariantes de seguridad e implementación de Claims.

---

> **⚠️ Pendiente Administrativo (Seguridad):** 
> Es necesario rotar el *Service Account* (`gen-lang-client-*.json`). La llave **nunca ha estado en el historial de Git** (confirmado), pero requiere rotación por higiene. **Importante:** Borra el JSON viejo del disco antes de revocar la clave en la consola de Google Cloud para evitar errores de autenticación en los scripts.
