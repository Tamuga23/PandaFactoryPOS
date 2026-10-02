// Tasa de cambio NIO/USD de RESPALDO, usada solo si company.defaultExchangeRate
// no está cargada. La tasa real se configura en Settings → Información de empresa.
export const DEFAULT_EXCHANGE_RATE = 36.6243;

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/*
  Medida de la foto que viaja al catálogo público.

  La foto del mostrador se guarda a 800px: se ve en el POS, en el Inventario y
  en la factura, todas superficies donde hay pantalla grande y la imagen se lee
  del mismo documento del producto.

  La de la tablet va aparte y más chica porque el espejo `catalogo_publico` se
  lee ENTERO: cada kilobyte se multiplica por la cantidad de productos cada vez
  que la tablet carga el catálogo. A 400px y calidad 0.6 son unos 30 KB por
  producto, que a cien productos son 3 MB — contra los 12 MB que serían con la
  foto de 800px.
*/
export const MEDIDA_FOTO_TABLET = { ancho: 400, alto: 400, calidad: 0.6 } as const;

export const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
};

/**
 * Dinero. Dos monedas, dos reglas, y las dos SE DICEN.
 *
 * El reparto es una decisión del negocio (confirmada el 2026-09-22): el
 * inventario y las ventas se miden en DÓLARES, que es como se compra y como se
 * mide el margen; la FACTURACIÓN va en córdobas, que es lo que el cliente paga.
 * Por eso el POS cobra en C$, la factura se imprime en C$, y el Panel, el
 * Historial, Inventario, Clientes, Compras y Reportes hablan en US$.
 *
 * Lo que faltaba era el rótulo. Esta función emitía un `$` pelado, y en
 * Nicaragua un `$` a secas es ambiguo: el operador vende todo el día en
 * córdobas y después lee `$350.00` en seis pantallas, donde la única diferencia
 * tipográfica con `C$350.00` es una letra y la diferencia real es 36x. Peor en
 * la tarjeta del Historial, donde el total en dólares y la cuota en córdobas
 * quedaban a tres renglones de distancia sin ninguna etiqueta que los separe.
 *
 * Ahora emite `US$12,713.45`, que tiene exactamente la misma forma que
 * `C$12,713.45` —mismo agrupamiento, mismos decimales— y se distingue de un
 * vistazo. Es además como ya lo escribía el código a mano en el POS y en el
 * Catálogo Maestro.
 */
export const formatCurrency = (amount: number, currency: 'USD' | 'NIO' = 'USD') => {
  if (currency === 'NIO') {
    return formatCurrencyNIO(amount);
  }
  return 'US$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCurrencyNIO = (amount: number) => {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
  }).format(amount).replace('NIO', 'C$');
};
