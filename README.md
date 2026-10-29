# Motor de inferencia — Árboles semánticos

Aplicación web para convertir una base de conocimiento en español controlado a lógica proposicional y comprobar su satisfacibilidad mediante tableaux semánticos. El análisis se ejecuta en el navegador; no necesita servidor de aplicación.

## Método

El motor carga todas las reglas como verdaderas en la raíz y expande fórmulas compuestas de acuerdo con las reglas clásicas de tableaux. Las expansiones conjuntivas permanecen en la misma rama; disyunciones, implicaciones y equivalencias crean alternativas. Una rama se cierra únicamente cuando contiene un átomo y su negación. Las ramas abiertas saturadas generan modelos, que se comprueban contra todas las reglas originales.

## Tecnologías

- JavaScript ES modules, HTML y CSS, sin dependencias de ejecución.
- Node.js y `node:test` para las pruebas automatizadas.
- GitHub Actions y GitHub Pages para publicación estática.

## Funciones

- Analizador de fragmento controlado de español con normalización de mayúsculas y espacios, paréntesis y AST.
- Asignación consistente de átomos, también cuando se niegan.
- Formalización de `y`, `o`, `no`, `si A, entonces B`, `B si A` y `si y solo si`.
- Tableau con registro de expansiones, origen, regla lógica y contradicciones.
- Detección SAT/UNSAT, conteo de ramas y generación y verificación de modelos.
- Árbol navegable con zoom y resultados accesibles desde pantallas pequeñas.

## Lenguaje admitido

Escribe una proposición por línea. Se aceptan hechos simples como `Es de día`, negaciones prefijas como `No voy a trabajar`, y los conectivos indicados arriba. Los paréntesis agrupan expresiones completas, por ejemplo `No (Llueve y hace frío)` o `Si (Llueve o nieva), entonces hace frío`. Se permiten prefijos opcionales como `R1:`.

Este parser no es un sistema de comprensión de lenguaje natural general. Cada proposición atómica se identifica por su texto normalizado; sinónimos y paráfrasis no se reconocen como la misma proposición. Las frases ambiguas, vocabulario no admitido o paréntesis incorrectos producen un mensaje de error en lugar de una interpretación silenciosa. «No» se admite como negación al inicio de una expresión.

## Ejemplo

Entrada:

```text
R1: Si es de día, entonces voy a trabajar.
R2: Si llueve, entonces no voy a trabajar.
R3: Es de día.
```

Resultado esperado: `p → q`, `r → ¬q`, `p`; una rama abierta y dos cerradas. El modelo abierto es `p = V`, `q = V`, `r = F`, así que la base es SATISFACIBLE.

## Ejecutar localmente

Sirve la carpeta desde el directorio del proyecto con Python 3 y abre `http://localhost:8000`. Los módulos ES necesitan un origen HTTP, por lo que no se debe abrir el archivo HTML directamente. Para ejecutar las pruebas se requiere Node.js 20 o posterior:

```sh
python3 -m http.server 8000
```

En otra terminal, ejecuta las pruebas:

```sh
node --test engine.test.mjs
```

## Publicación

El workflow de GitHub Actions publica automáticamente la raíz del repositorio en GitHub Pages al actualizar `main`. Tras habilitar Pages con origen **GitHub Actions** en la configuración del repositorio, la URL prevista es:

<https://daniarellano0348.github.io/Arbol-semantico-/>

La URL se considera publicada solo cuando el despliegue de Pages termina y el sitio responde correctamente.