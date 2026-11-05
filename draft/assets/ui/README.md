# Recursos de los menús

Los ocho PNG definitivos están incorporados en las rutas acordadas:

- backgrounds/stadium-night.png
- modes/draft-classic.png
- modes/career.png
- modes/survival.png
- trophies/bronze.png
- trophies/silver.png
- trophies/gold.png
- trophies/platinum.png

Estadio: 1672×941. Modos: 1448×1086. Trofeos: 1254×1254. La prueba menu-assets.mjs decodifica los originales y verifica transparencia real en las siete imágenes de primer plano. Ver ../../docs/menu-assets.json.

Fondo: cover centrado. Ilustraciones y trofeos: contain, sin deformación. Se conservaron resolución y alfa originales. No se utilizaron capturas completas de Gemini como interfaz ni se crearon ilustraciones alternativas. El fallback textual sigue disponible si falta un recurso en una copia futura.

Los originales suman aproximadamente 13,6 MB. No se afirma que se hayan convertido a WebP ni optimizado; se priorizó conservar los PNG proporcionados. Las rutas relativas funcionan con Live Server y hosting bajo subdirectorio.
